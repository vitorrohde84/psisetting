import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Validação e resgate de cupons — sempre via service_role.
 *
 * A11 — docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
 *
 * Três defeitos encadeados na versão anterior:
 *
 *  1. A policy `coupons_read_active` dava SELECT a qualquer autenticado sobre
 *     todo cupom ativo. O rate limit de 8 tentativas/5min existia para impedir
 *     adivinhação de código — e era inútil, porque bastava listar a tabela e
 *     ler os códigos, inclusive os de acesso VIP vitalício.
 *
 *  2. O incremento de uses_count era feito com o client do usuário. Como não
 *     havia policy de UPDATE em coupons, o update afetava zero linhas e não
 *     retornava erro. uses_count ficava eternamente em 0, então max_uses nunca
 *     era atingido: todo cupom de uso único era, na prática, ilimitado.
 *
 *  3. O incremento era read-modify-write (uses_count + 1 lido antes), o que
 *     perde contagem sob concorrência mesmo com a policy correta.
 *
 * Aqui: leitura e escrita por service_role, limite conferido de verdade, e
 * incremento atômico via função no banco.
 *
 * Desde a entrega 1 (23/09), o resgate de cupom de DESCONTO não passa mais por
 * aqui: ele é gravado na aprovação do pagamento, dentro de
 * processar_pagamento_aprovado (utils/pagamento-aprovado.ts). registrarResgate
 * ficou para VIP e dias de teste, que são concedidos na hora.
 */

/**
 * Uma mensagem só para código inexistente, pausado, vencido ou esgotado.
 * Mensagens diferentes contariam a quem testa códigos quais deles existem —
 * inclusive os de VIP vitalício, que é exatamente o que a A11 fechou.
 */
export const MENSAGEM_CUPOM_INVALIDO = "Cupom inválido ou expirado.";

interface ResolverParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: SupabaseClient<any, any, any>;
  code: string;
  userId: string;
  basePrice: number;
}

export type ResolverResultado =
  | { valido: false; motivo: string }
  | {
      valido: true;
      couponId: string;
      code: string;
      tipo: string;
      valor: number;
      valorFinal: number;
      trialDays: number;
      vip: boolean;
      /** null = para sempre. */
      duracaoMeses: number | null;
      paraSempre: boolean;
    };

/** Normaliza o código como ele é gravado: sem espaços e em maiúsculas. */
export function normalizarCodigo(code: unknown): string {
  return String(code ?? "").trim().toUpperCase();
}

/**
 * Duração gravada no cupom. Antes da migração 20260923120000 as colunas não
 * existem (undefined): aí o cupom vale como sempre valeu, 1 mensalidade.
 */
export function duracaoDoCupom(coupon: {
  duracao_meses?: number | null;
  para_sempre?: boolean | null;
}): { duracaoMeses: number | null; paraSempre: boolean } {
  if (coupon.para_sempre === true) return { duracaoMeses: null, paraSempre: true };
  const meses = Number(coupon.duracao_meses);
  return {
    duracaoMeses: Number.isInteger(meses) && meses >= 1 ? meses : 1,
    paraSempre: false,
  };
}

export async function resolverDescontoDeCupom({
  adminClient,
  code,
  userId,
  basePrice,
}: ResolverParams): Promise<ResolverResultado> {
  const cleanCode = normalizarCodigo(code);

  if (!cleanCode || cleanCode.length > 64) {
    return { valido: false, motivo: MENSAGEM_CUPOM_INVALIDO };
  }

  const { data: coupon } = await adminClient
    .from("coupons")
    .select("*")
    .eq("code", cleanCode)
    .eq("active", true)
    .maybeSingle();

  if (!coupon || coupon.arquivado_em) {
    return { valido: false, motivo: MENSAGEM_CUPOM_INVALIDO };
  }

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { valido: false, motivo: MENSAGEM_CUPOM_INVALIDO };
  }

  // Agora é conferível de verdade, porque uses_count passou a ser incrementado.
  if (coupon.max_uses != null && (coupon.uses_count ?? 0) >= coupon.max_uses) {
    return { valido: false, motivo: MENSAGEM_CUPOM_INVALIDO };
  }

  // Um resgate por pessoa. O UNIQUE(coupon_id, profile_id) no banco é a trava
  // real; esta consulta só serve para dar mensagem melhor.
  const { data: resgatePrevio } = await adminClient
    .from("coupon_redemptions")
    .select("id")
    .eq("coupon_id", coupon.id)
    .eq("profile_id", userId)
    .maybeSingle();

  if (resgatePrevio) {
    return { valido: false, motivo: "Você já utilizou este cupom." };
  }

  const tipo = coupon.discount_type || "trial_days";
  const valor = Number(coupon.discount_value) || 0;

  let valorFinal = basePrice;
  if (tipo === "percent" && valor > 0) {
    valorFinal = Math.max(1, basePrice - (basePrice * valor) / 100);
  } else if (tipo === "fixed" && valor > 0) {
    valorFinal = Math.max(1, basePrice - valor);
  }

  return {
    valido: true,
    couponId: coupon.id,
    code: cleanCode,
    tipo,
    valor,
    valorFinal: Number(valorFinal.toFixed(2)),
    trialDays: tipo === "trial_days" ? valor : 0,
    vip: tipo === "vip",
    ...duracaoDoCupom(coupon),
  };
}

/**
 * Registra o resgate de cupom de VIP ou de dias de teste e incrementa o
 * contador de forma atômica. A ordem importa: o INSERT em coupon_redemptions
 * tem UNIQUE(coupon_id, profile_id), então ele é a trava contra resgate duplo.
 * Só depois de ele passar é que o contador sobe. A foto das condições é
 * preenchida pelo trigger do banco.
 */
export async function registrarResgate({
  adminClient,
  couponId,
  userId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: SupabaseClient<any, any, any>;
  couponId: string;
  userId: string;
}): Promise<{ registrado: boolean }> {
  const { error } = await adminClient
    .from("coupon_redemptions")
    .insert({ coupon_id: couponId, profile_id: userId });

  if (error) {
    // 23505 = unique_violation: já resgatado por este usuário.
    if (error.code === "23505") {
      return { registrado: false };
    }
    console.error("[cupom] falha ao registrar resgate:", error);
    throw error;
  }

  // Incremento atômico no banco (uses_count = uses_count + 1), imune a corrida.
  const { error: rpcError } = await adminClient.rpc("increment_coupon_uses", {
    p_coupon_id: couponId,
  });

  if (rpcError) {
    // Não desfaz o resgate: o usuário tem direito ao benefício. Mas registra
    // alto, porque contador parado foi exatamente o defeito original.
    console.error("[cupom] resgate registrado mas contador não subiu:", rpcError);
  }

  return { registrado: true };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { descontosEmUso, escolherMelhorDesconto, type DescontoAplicado } from "./preco-assinatura";
import { PRECO_BASE } from "./preco-desconto";

/**
 * Cupom em uso e forma do último pagamento de cada conta — para o painel admin
 * (lista de psicólogos, gaveta de detalhes e receita mensal).
 *
 * Usa a mesma regra do preço cobrado (foto do resgate, mensalidades restantes,
 * vence o menor preço). Antes as métricas ligavam cada resgate ao cupom ATUAL
 * e aplicavam o desconto para sempre: quem usou um cupom de 1 mês em agosto
 * entrava na receita com desconto até hoje.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, any, any>;

export interface CupomEmUsoAdmin {
  codigo: string;
  tipo: DescontoAplicado["tipo"];
  valor: number;
  paraSempre: boolean;
  restantes: number | null;
  duracaoMeses: number | null;
  valorFinal: number;
}

export interface AssinaturaAdmin {
  cupomEmUso: CupomEmUsoAdmin | null;
  ultimoMeio: "pix" | "cartao" | null;
  ultimoPagamentoEm: string | null;
}

export async function carregarAssinaturasAdmin(
  adminClient: AdminClient
): Promise<Record<string, AssinaturaAdmin>> {
  const resultado: Record<string, AssinaturaAdmin> = {};
  const garantir = (id: string) =>
    (resultado[id] ??= { cupomEmUso: null, ultimoMeio: null, ultimoPagamentoEm: null });

  const { data: resgates, error: resgatesError } = await adminClient
    .from("coupon_redemptions")
    .select(
      "profile_id, coupon_id, desconto_tipo, desconto_valor, duracao_meses, para_sempre, mensalidades_usadas, encerrado_em, coupons(code)"
    )
    .in("desconto_tipo", ["percent", "fixed"]);

  if (resgatesError) {
    // Antes da migração 20260923120000: sem foto, sem cupom em uso.
    console.error("[admin] não foi possível ler os cupons em uso:", resgatesError.message);
  } else {
    const porConta: Record<string, typeof resgates> = {};
    for (const r of resgates ?? []) (porConta[r.profile_id] ??= []).push(r);

    for (const [perfilId, linhas] of Object.entries(porConta)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const melhor = escolherMelhorDesconto(descontosEmUso(linhas as any, PRECO_BASE));
      if (!melhor) continue;
      garantir(perfilId).cupomEmUso = {
        codigo: melhor.code,
        tipo: melhor.tipo,
        valor: melhor.valor,
        paraSempre: melhor.paraSempre,
        restantes: melhor.restantes,
        duracaoMeses: melhor.duracaoMeses,
        valorFinal: melhor.valorFinal,
      };
    }
  }

  const { data: eventos, error: eventosError } = await adminClient
    .from("payment_events")
    .select("user_id, meio, processed_at, revertido_em")
    .order("processed_at", { ascending: false });

  if (eventosError) {
    console.error("[admin] não foi possível ler os pagamentos:", eventosError.message);
  } else {
    for (const e of eventos ?? []) {
      if (!e.user_id || e.revertido_em) continue;
      const a = garantir(e.user_id);
      if (a.ultimoPagamentoEm) continue; // já tem o mais recente
      a.ultimoPagamentoEm = e.processed_at;
      a.ultimoMeio = e.meio === "pix" || e.meio === "cartao" ? e.meio : null;
    }
  }

  return resultado;
}

/** Quanto a conta paga por mês hoje, para a receita mensal do painel. */
export function precoMensalDaConta(a: AssinaturaAdmin | undefined): number {
  return a?.cupomEmUso?.valorFinal ?? PRECO_BASE;
}

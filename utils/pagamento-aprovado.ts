import type { SupabaseClient } from "@supabase/supabase-js";
import { PRECO_BASE, ehTipoDesconto, type TipoDesconto } from "./preco-desconto";
import type { DescontoAplicado } from "./preco-assinatura";
import { ativarAssinatura, definirStatusAssinatura } from "./subscription-activation";

/**
 * Pagamento aprovado → dias de acesso e mensalidade de cupom, num passo só.
 *
 * O mesmo pagamento chega por até quatro caminhos: process-payment (cartão
 * aprovado na hora), pix/check (polling do modal), webhook do Mercado Pago e a
 * reconciliação de /api/subscription/status. Todos passam por aqui, e aqui tudo
 * vai para uma função do banco que faz a trava de idempotência, os dias e o
 * cupom numa transação (processar_pagamento_aprovado, migração 20260923120000).
 *
 * As condições do desconto viajam na metadata do pagamento, gravadas pelo
 * servidor na criação. É a foto do que o cliente viu: se o admin editar ou
 * pausar o cupom enquanto um PIX está em aberto, vale o que foi prometido — e o
 * banco ainda confere, na aprovação, se o desconto ainda cabe.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, any, any>;

export type OrigemPagamento = "process-payment" | "pix-check" | "webhook" | "reconciliacao";
export type MeioPagamento = "pix" | "cartao";

/** O pedaço do pagamento do Mercado Pago que interessa aqui. */
export interface PagamentoMP {
  id?: number | string;
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
  payment_type_id?: string;
  payment_method_id?: string;
  metadata?: unknown;
}

export interface FotoDoPagamento {
  cupomId: string;
  tipo: TipoDesconto;
  valor: number;
  duracaoMeses: number | null;
  paraSempre: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O que vai na metadata do pagamento. Tudo como texto: o Mercado Pago devolve
 * as chaves em snake_case e pode descartar nulos, então "para sempre" é
 * explícito e nenhum valor é null.
 */
export function metadataDoDesconto(d: DescontoAplicado | null): Record<string, string> | undefined {
  if (!d) return undefined;
  return {
    cupom_id: d.couponId,
    cupom_tipo: d.tipo,
    cupom_valor: String(d.valor),
    cupom_duracao: d.paraSempre ? "sempre" : String(d.duracaoMeses ?? 1),
  };
}

/** Lê e valida a foto da metadata. Qualquer coisa fora do formato = sem cupom. */
export function lerDescontoDaMetadata(metadata: unknown): FotoDoPagamento | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;

  const cupomId = String(m.cupom_id ?? "");
  if (!UUID.test(cupomId)) return null;

  const tipo = m.cupom_tipo;
  if (!ehTipoDesconto(tipo)) return null;

  const valor = Number(m.cupom_valor);
  if (!Number.isFinite(valor) || valor <= 0 || (tipo === "percent" && valor > 100)) return null;

  const duracaoTexto = String(m.cupom_duracao ?? "1");
  if (duracaoTexto === "sempre") {
    return { cupomId, tipo, valor, duracaoMeses: null, paraSempre: true };
  }

  const duracao = Number(duracaoTexto);
  if (!Number.isInteger(duracao) || duracao < 1 || duracao > 120) return null;

  return { cupomId, tipo, valor, duracaoMeses: duracao, paraSempre: false };
}

export function meioDoPagamento(p: Pick<PagamentoMP, "payment_type_id" | "payment_method_id">): MeioPagamento | null {
  if (p.payment_method_id === "pix" || p.payment_type_id === "bank_transfer") return "pix";
  if (p.payment_type_id === "credit_card" || p.payment_type_id === "debit_card") return "cartao";
  return null;
}

/**
 * A função do banco ainda não existe: o código subiu antes do SQL.
 *
 * Só pelos códigos de "função não encontrada". Olhar o nome da função na
 * mensagem pegaria também os erros de DENTRO dela ("processar_pagamento_aprovado:
 * perfil ... nao encontrado") e cairia no caminho antigo, que marcaria o
 * pagamento como processado sem dar dia nenhum.
 */
export function funcaoAusente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /Could not find the function/i.test(error.message ?? "")
  );
}

/**
 * Erro que não se resolve reenviando: perfil inexistente (RAISE da função,
 * P0001), referência que não é UUID (22P02: pagamento de outro produto na
 * mesma conta do Mercado Pago), usuário apagado (23503). O webhook responde
 * 200 para estes — com 500, o Mercado Pago reenviaria por dias.
 */
export function erroPermanente(error: unknown): boolean {
  const e = error as { code?: string; status?: number } | null;
  // 400/404 do Mercado Pago (id inexistente, notificação de teste): o SDK lança
  // com `status` e sem `code`. Reenviar também não resolve.
  if (e?.status === 400 || e?.status === 404) return true;
  const code = e?.code;
  return code === "P0001" || code === "22P02" || code === "23503";
}

export interface ResultadoProcessamento {
  jaProcessado: boolean;
  dias?: number;
  observacao?: string | null;
  cupomContado?: boolean;
  /** true quando rodou o caminho antigo, sem a função do banco. */
  semMigracao?: boolean;
}

export async function processarPagamentoAprovado({
  adminClient,
  userId,
  payment,
  origem,
}: {
  adminClient: AdminClient;
  userId: string;
  payment: PagamentoMP;
  origem: OrigemPagamento;
}): Promise<ResultadoProcessamento> {
  if (payment.status !== "approved" || payment.id === undefined || payment.id === null) {
    throw new Error(`[pagamento] processarPagamentoAprovado chamado com pagamento não aprovado (${payment.status}).`);
  }

  const paymentId = String(payment.id);
  const foto = lerDescontoDaMetadata(payment.metadata);

  const { data, error } = await adminClient.rpc("processar_pagamento_aprovado", {
    p_payment_id: paymentId,
    p_user_id: userId,
    p_origem: origem,
    p_meio: meioDoPagamento(payment),
    p_valor: Number(payment.transaction_amount) || 0,
    p_preco_base: PRECO_BASE,
    p_cupom_id: foto?.cupomId ?? null,
    p_cupom_tipo: foto?.tipo ?? null,
    p_cupom_valor: foto?.valor ?? null,
    p_cupom_duracao: foto?.duracaoMeses ?? null,
    p_cupom_para_sempre: foto?.paraSempre ?? false,
  });

  if (error) {
    if (!funcaoAusente(error)) throw error;

    // Caminho de reserva: quem pagou recebe os dias mesmo se o push chegou
    // antes do SQL. A mensalidade do cupom não é contada — e isso é gritado no
    // log, porque é exatamente o que o SQL existe para fazer.
    console.error(
      `[pagamento] MIGRAÇÃO 20260923120000 NÃO APLICADA — pagamento ${paymentId} ativado pelo caminho antigo, sem contar cupom.`
    );
    const r = await ativarAssinatura({ adminClient, userId, paymentId, origem });
    return { jaProcessado: r.jaProcessado, dias: r.aplicado ? 30 : undefined, semMigracao: true };
  }

  const resultado = (data ?? {}) as {
    ja_processado?: boolean;
    dias?: number;
    observacao?: string | null;
    cupom_contado?: boolean;
  };

  // Outro caminho (webhook, reconciliação) chegou antes: os dias já foram
  // gravados. Lê o que foi concedido, para a tela mostrar o número real.
  if (resultado.ja_processado) {
    const { data: evento } = await adminClient
      .from("payment_events")
      .select("dias_concedidos, observacao")
      .eq("payment_id", paymentId)
      .maybeSingle();
    return {
      jaProcessado: true,
      dias: evento?.dias_concedidos ?? undefined,
      observacao: evento?.observacao ?? null,
    };
  }

  if (resultado.observacao) {
    // Desconto que não coube na aprovação (esgotado, pausado, no limite): os
    // dias saíram proporcionais ao valor pago. Não é erro, mas o admin precisa
    // conseguir explicar se a pessoa perguntar.
    console.warn(`[pagamento] ${paymentId} de ${userId}: ${resultado.observacao} (${resultado.dias} dias).`);
  }

  return {
    jaProcessado: Boolean(resultado.ja_processado),
    dias: resultado.dias,
    observacao: resultado.observacao ?? null,
    cupomContado: resultado.cupom_contado,
  };
}

/**
 * Estorno ou chargeback: devolve os dias daquele pagamento. Idempotente por
 * payment_id no banco. A mensalidade de cupom não volta — se voltasse,
 * estornar viraria um jeito de reusar o desconto.
 */
export async function reverterPagamento({
  adminClient,
  paymentId,
  userId,
  motivo,
}: {
  adminClient: AdminClient;
  paymentId: string;
  userId: string;
  motivo: string;
}): Promise<void> {
  const { error } = await adminClient.rpc("reverter_pagamento", {
    p_payment_id: paymentId,
    p_motivo: motivo,
  });

  if (!error) return;
  if (!funcaoAusente(error)) throw error;

  console.error(`[pagamento] MIGRAÇÃO 20260923120000 NÃO APLICADA — estorno de ${paymentId} só marcou o status.`);
  await definirStatusAssinatura({ adminClient, userId, status: "past_due" });
}

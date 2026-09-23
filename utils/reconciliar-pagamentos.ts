import type { SupabaseClient } from "@supabase/supabase-js";
import { paymentClient } from "./mercadopago";
import { processarPagamentoAprovado } from "./pagamento-aprovado";

/**
 * Rede de segurança: pagamento aprovado que nunca virou dias de acesso.
 *
 * Três situações em que isso acontece, e nenhuma é rara:
 *  - o cartão fica "em análise" e só é aprovado minutos depois;
 *  - a pessoa gera o PIX, fecha o modal e paga pelo celular depois — o polling
 *    do modal já morreu;
 *  - o webhook não chega (sem MERCADO_PAGO_WEBHOOK_SECRET ele recusa tudo, e
 *    antes desta entrega um erro no processamento respondia 200, então o
 *    Mercado Pago não reenviava).
 * Com o acesso decidido pelas datas, qualquer uma delas deixaria em somente
 * leitura alguém que pagou. Aqui o servidor pergunta direto ao Mercado Pago.
 *
 * Seguro de repetir: cada pagamento passa pela mesma função idempotente dos
 * outros caminhos.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, any, any>;

const JANELA_DIAS = 45;

/**
 * Antes deste momento nenhum pagamento era registrado em payment_events (a
 * tabela nasceu com a correção de 17/09, publicada por volta das 17h15). Um
 * pagamento antigo ausente da tabela JÁ deu os dias dele pelo código da época —
 * reprocessá-lo aqui daria 30 dias de graça a quem pagou em agosto.
 */
export const INICIO_DO_REGISTRO = new Date("2026-09-17T18:00:00-03:00");

export async function reconciliarPagamentos({
  adminClient,
  userId,
}: {
  adminClient: AdminClient;
  userId: string;
}): Promise<{ processados: number }> {
  const agora = new Date();
  const inicio = new Date(
    Math.max(agora.getTime() - JANELA_DIAS * 24 * 60 * 60 * 1000, INICIO_DO_REGISTRO.getTime())
  );

  const busca = await paymentClient.search({
    options: {
      external_reference: userId,
      status: "approved",
      sort: "date_created",
      criteria: "desc",
      range: "date_created",
      begin_date: inicio.toISOString(),
      end_date: agora.toISOString(),
      limit: 30,
    },
  });

  // A busca filtra por external_reference, mas a posse é conferida de novo
  // aqui: é ela que impede que o pagamento de outra pessoa vire dias para esta.
  const aprovados = (busca.results ?? []).filter(
    (p) =>
      p.status === "approved" &&
      p.external_reference === userId &&
      p.id &&
      // A busca já filtra pela data, mas o corte é conferido de novo aqui: é ele
      // que impede o mês grátis por pagamento anterior ao registro.
      p.date_created &&
      new Date(p.date_created).getTime() >= INICIO_DO_REGISTRO.getTime()
  );
  if (aprovados.length === 0) return { processados: 0 };

  const ids = aprovados.map((p) => String(p.id));
  const { data: jaProcessados, error } = await adminClient
    .from("payment_events")
    .select("payment_id")
    .in("payment_id", ids);

  if (error) throw error;

  const conhecidos = new Set((jaProcessados ?? []).map((e: { payment_id: string }) => e.payment_id));
  let processados = 0;

  for (const p of aprovados) {
    if (conhecidos.has(String(p.id))) continue;

    // O resultado da busca é resumido; o pagamento completo traz a metadata
    // com a foto do desconto.
    const completo = await paymentClient.get({ id: String(p.id) });
    if (completo.status !== "approved" || completo.external_reference !== userId) continue;

    const r = await processarPagamentoAprovado({
      adminClient,
      userId,
      payment: completo,
      origem: "reconciliacao",
    });
    if (!r.jaProcessado) {
      processados++;
      console.warn(`[reconciliacao] pagamento ${p.id} de ${userId} não tinha sido processado — processado agora.`);
    }
  }

  return { processados };
}

import { cancelarPagamento, paymentClient } from "./mercadopago";
import { pixDeveSerCancelado } from "./pix-validade";

/**
 * Faz valer os 15 minutos do QR no Mercado Pago (ver utils/pix-validade.ts).
 * Cancelar é sempre seguro para quem pagou: o Mercado Pago recusa cancelar um
 * pagamento aprovado, e aí o pagamento é relido e creditado normalmente.
 */

type Pagamento = Awaited<ReturnType<typeof paymentClient.get>>;
type PixMinimo = Pick<Pagamento, "id" | "status" | "payment_method_id" | "date_created">;

/**
 * PIX pendente que passou da validade: cancela e devolve o pagamento como
 * ficou. Qualquer outro pagamento volta intacto.
 */
export async function vencerPixForaDoPrazo<P extends PixMinimo>(
  payment: P,
  agora = new Date()
): Promise<P | Pagamento> {
  if (payment.status !== "pending" || payment.payment_method_id !== "pix" || !payment.id) return payment;
  if (!pixDeveSerCancelado(payment.date_created, agora)) return payment;

  try {
    const cancelado = await cancelarPagamento(String(payment.id));
    return cancelado?.status ? cancelado : { ...payment, status: "cancelled" };
  } catch (err) {
    // Recusado: quase sempre é o PIX pago no último instante. Relê para que
    // quem chamou credite o aprovado — nunca responder "expirou" a quem pagou.
    console.warn(`[pix] cancelamento do PIX ${payment.id} recusado; relendo o pagamento:`, err);
    return paymentClient.get({ id: String(payment.id) });
  }
}

/**
 * Um QR válido por pessoa: ao gerar um novo, os anteriores ainda pendentes são
 * cancelados. Sem isto, quem fechou o modal e gerou outro QR ficava com dois
 * pagáveis e podia pagar os dois.
 */
export async function cancelarOutrosPixPendentes({
  userId,
  exceto,
  agora = new Date(),
}: {
  userId: string;
  exceto: string;
  agora?: Date;
}): Promise<number> {
  // O Mercado Pago vence o PIX sozinho em 32 min: uma hora de janela cobre tudo.
  const busca = await paymentClient.search({
    options: {
      external_reference: userId,
      status: "pending",
      sort: "date_created",
      criteria: "desc",
      range: "date_created",
      begin_date: new Date(agora.getTime() - 60 * 60_000).toISOString(),
      end_date: agora.toISOString(),
      limit: 20,
    },
  });

  // A busca já filtra, mas posse, meio e status são conferidos de novo aqui:
  // cancelar o pagamento de outra pessoa (ou um cartão em análise) seria grave.
  const alvos = (busca.results ?? []).filter(
    (p) =>
      p.id &&
      String(p.id) !== exceto &&
      p.status === "pending" &&
      p.payment_method_id === "pix" &&
      p.external_reference === userId
  );

  let cancelados = 0;
  for (const p of alvos) {
    try {
      await cancelarPagamento(String(p.id));
      cancelados++;
    } catch (err) {
      // Pago enquanto isto rodava: o webhook e a reconciliação creditam.
      console.warn(`[pix] não foi possível cancelar o PIX anterior ${p.id}:`, err);
    }
  }
  return cancelados;
}

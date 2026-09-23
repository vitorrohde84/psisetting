import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { preApprovalClient, paymentClient } from "@/utils/mercadopago";
import { definirStatusAssinatura } from "@/utils/subscription-activation";
import { erroPermanente, processarPagamentoAprovado, reverterPagamento } from "@/utils/pagamento-aprovado";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Webhook do Mercado Pago.
 *
 * A08 — docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
 *
 * Três defeitos na versão anterior:
 *
 *  1. Nenhuma validação de assinatura. A rota é pública por necessidade, e
 *     reenviar o id de um pagamento `rejected`/`refunded` conhecido forçava
 *     `past_due` na conta da vítima — derrubando o acesso de um terceiro.
 *
 *  2. O client era criado com
 *       SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY
 *     Se a variável sumisse, todos os updates passavam a esbarrar em RLS,
 *     retornavam sucesso com 0 linhas, e clientes pagantes nunca eram
 *     ativados — sem erro nenhum. createAdminClient() falha alto.
 *
 *  3. O caminho `approved` gravava status ativo SEM current_period_end, então
 *     a assinatura criada por esse caminho nunca expirava.
 */

const MP_WEBHOOK_SECRET = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

/**
 * Valida a assinatura conforme a especificação do Mercado Pago.
 * Manifesto: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 */
function assinaturaValida(
  request: Request,
  dataId: string | null
): { ok: boolean; motivo?: string } {
  if (!MP_WEBHOOK_SECRET) {
    // Sem segredo configurado não há como distinguir o Mercado Pago de
    // qualquer pessoa na internet. Falha fechada, de propósito: as ativações
    // continuam funcionando por process-payment e pix/check.
    return { ok: false, motivo: "MERCADO_PAGO_WEBHOOK_SECRET não configurado" };
  }

  const signature = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");

  if (!signature) return { ok: false, motivo: "x-signature ausente" };

  const partes = Object.fromEntries(
    signature.split(",").map((p) => {
      const [k, ...resto] = p.split("=");
      return [k.trim(), resto.join("=").trim()];
    })
  );

  const ts = partes["ts"];
  const v1 = partes["v1"];
  if (!ts || !v1) return { ok: false, motivo: "x-signature malformado" };

  // Janela de 5 minutos: impede replay de uma notificação capturada.
  const idadeMs = Math.abs(Date.now() - Number(ts) * 1000);
  if (!Number.isFinite(idadeMs) || idadeMs > 5 * 60 * 1000) {
    return { ok: false, motivo: "timestamp fora da janela" };
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const esperado = createHmac("sha256", MP_WEBHOOK_SECRET)
    .update(manifest)
    .digest("hex");

  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, motivo: "assinatura não confere" };
  }

  return { ok: true };
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    let topic = searchParams.get("type") || searchParams.get("topic");
    let resourceId = searchParams.get("data.id") || searchParams.get("id");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let bodyData: any = {};
    try {
      bodyData = await request.json();
      if (!topic && bodyData.type) topic = bodyData.type;
      if (!resourceId && bodyData.data?.id) resourceId = bodyData.data.id;
    } catch {
      // Body vazio não é erro: o Mercado Pago faz pings de verificação.
    }

    if (!resourceId) {
      return NextResponse.json({ received: true });
    }

    // ── Autenticidade antes de qualquer efeito colateral ─────────────────
    const auth = assinaturaValida(request, resourceId);
    if (!auth.ok) {
      console.warn(`[webhook-mp] notificação recusada: ${auth.motivo}`);
      return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // 1. Assinatura recorrente (preapproval)
    if (topic === "subscription_preapproval" || topic === "preapproval") {
      const sub = await preApprovalClient.get({ id: resourceId });

      if (sub && sub.external_reference) {
        const userId = sub.external_reference;

        if (sub.status === "authorized") {
          // Só registra a assinatura. Os DIAS vêm de cada cobrança aprovada,
          // pelo tópico "payment" (idempotente por payment_id). Antes, cada
          // aviso de preapproval com last_modified novo somava +30 dias sem
          // pagamento nenhum — e com o acesso decidido pelas datas, isso viraria
          // acesso de verdade.
          await supabaseAdmin
            .from("profiles")
            .update({
              mp_subscription_id: sub.id,
              mp_customer_id: sub.payer_id?.toString() || null,
            })
            .eq("id", userId);
        } else if (sub.status === "cancelled") {
          await definirStatusAssinatura({
            adminClient: supabaseAdmin,
            userId,
            status: "canceled",
          });
        } else if (sub.status === "paused") {
          await definirStatusAssinatura({
            adminClient: supabaseAdmin,
            userId,
            status: "past_due",
          });
        }
      }
    }

    // 2. Pagamento individual / cobrança da assinatura
    if (topic === "payment") {
      const payment = await paymentClient.get({ id: resourceId });

      // external_reference que não é id de conta = pagamento de outro produto
      // na mesma conta do Mercado Pago. Não é nosso: ignora.
      if (payment && payment.external_reference && UUID.test(payment.external_reference)) {
        const userId = payment.external_reference;

        if (payment.status === "approved") {
          // Idempotente: dias e mensalidade de cupom numa transação só.
          await processarPagamentoAprovado({
            adminClient: supabaseAdmin,
            userId,
            payment,
            origem: "webhook",
          });
        } else if (payment.status === "refunded" || payment.status === "charged_back") {
          // Com o acesso decidido pelas datas, só marcar "past_due" não tirava
          // nada: quem estornava continuava com os dias. Aqui eles voltam.
          await reverterPagamento({
            adminClient: supabaseAdmin,
            paymentId: String(payment.id),
            userId,
            motivo: payment.status,
          });
        } else if (payment.status === "rejected") {
          // Recusa não tira dias já pagos; o status fica como informação.
          await definirStatusAssinatura({
            adminClient: supabaseAdmin,
            userId,
            status: "past_due",
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (erroPermanente(error)) {
      // Reenviar não resolve (conta sem perfil, usuário apagado): registra e
      // encerra, em vez de fazer o Mercado Pago tentar de novo por dias.
      console.error("Webhook do Mercado Pago com erro permanente (não será reenviado):", error);
      return NextResponse.json({ received: true });
    }
    console.error("Erro no webhook do Mercado Pago:", error);
    // A notificação já passou pela assinatura: o erro é nosso (banco, rede).
    // 500 faz o Mercado Pago reenviar — seguro, porque o processamento é
    // idempotente. Antes respondia 200 e a ativação se perdia para sempre.
    return NextResponse.json({ error: "Falha ao processar a notificação." }, { status: 500 });
  }
}

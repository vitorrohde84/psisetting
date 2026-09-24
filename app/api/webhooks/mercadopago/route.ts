import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { invoiceClient, paymentClient, preApprovalClient } from "@/utils/mercadopago";
import { definirStatusAssinatura } from "@/utils/subscription-activation";
import { erroPermanente, processarPagamentoAprovado, reverterPagamento } from "@/utils/pagamento-aprovado";
import { ehCobrancaDeAssinatura, ehValidacaoDeCartao, idAssinaturaDoPagamento } from "@/utils/assinatura-cartao";
import {
  adotarAssinatura,
  assinaturaPorPreapproval,
  assinaturaViva,
  cancelarAssinaturaCartao,
  marcarRecusa,
  processarFatura,
  sincronizarAssinatura,
  type LinhaAssinatura,
} from "@/utils/assinatura-cartao-servidor";

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
 *
 * Renovação automática (23/09/2026): a assinatura (preapproval) não aceita
 * notification_url — os avisos dela e das cobranças vêm da URL configurada no
 * painel do Mercado Pago (Suas integrações → Webhooks), com os eventos
 * "Pagamentos" e "Planos e assinaturas" ligados e o mesmo segredo.
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

  // O Mercado Pago assina o id em minúsculas quando ele tem letras (o da
  // assinatura é hexadecimal). O id numérico dos pagamentos não muda.
  const manifest = `id:${(dataId ?? "").toLowerCase()};request-id:${requestId};ts:${ts};`;
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

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Sincroniza depois de uma cobrança: é o que sobe o valor para R$ 34,90 um mês
 * antes da cobrança seguinte. Falhar aqui não pode derrubar a notificação — os
 * dias já foram gravados, e a conferência diária tenta de novo.
 */
async function sincronizarSemDerrubar(admin: AdminClient, linha: LinhaAssinatura | null) {
  if (!linha || linha.situacao !== "ativa") return;
  try {
    await sincronizarAssinatura(admin, linha);
  } catch (err) {
    console.error(`[webhook-mp] sincronização de ${linha.mp_preapproval_id} falhou (a conferência diária refaz):`, err);
  }
}

/** Aviso da assinatura: criada, alterada, pausada, cancelada. */
async function tratarAssinatura(admin: AdminClient, preapprovalId: string) {
  const sub = await preApprovalClient.get({ id: preapprovalId });
  let linha = await assinaturaPorPreapproval(admin, String(sub.id ?? preapprovalId));

  // Não está na tabela pelo id: a criação que ficou sem resposta clara (linha
  // "criando"), uma duplicata nossa, ou uma que demos como falha cedo demais.
  // O aviso já traz a assinatura: vincula direto, sem depender da busca por
  // e-mail (utils/assinatura-cartao-servidor.ts → adotarAssinatura).
  if (!linha) linha = await adotarAssinatura(admin, sub);

  if (!linha) {
    // Assinatura do código antigo (antes de 23/09) ou de outro produto na
    // mesma conta do Mercado Pago. Não cancela sozinho — pode ser alguém pagando.
    console.error(
      `[webhook-mp] assinatura ${sub.id} (ref ${String(sub.external_reference ?? "")}, ${sub.status}) não está em assinaturas_cartao.`
    );
    return;
  }

  await sincronizarAssinatura(admin, linha);
}

/** Aviso de fatura (cobrança mensal da assinatura). */
async function tratarFatura(admin: AdminClient, faturaId: string) {
  const fatura = await invoiceClient.get({ id: faturaId });
  if (!fatura?.preapproval_id) return;

  let linha = await assinaturaPorPreapproval(admin, String(fatura.preapproval_id));
  // A fatura pode chegar antes de a assinatura estar ligada à linha (criação
  // sem resposta clara): adota pela própria assinatura.
  if (!linha) {
    linha = await adotarAssinatura(admin, await preApprovalClient.get({ id: String(fatura.preapproval_id) }));
  }
  if (!linha) {
    console.error(`[webhook-mp] fatura ${faturaId} de assinatura desconhecida ${fatura.preapproval_id}.`);
    return;
  }

  const r = await processarFatura(
    admin,
    linha,
    {
      id: fatura.id,
      preapproval_id: fatura.preapproval_id,
      status: fatura.status,
      payment: fatura.payment ? { id: fatura.payment.id, status: fatura.payment.status } : null,
      debit_date: fatura.debit_date ?? null,
    },
    "webhook"
  );
  if (r === "aprovada") await sincronizarSemDerrubar(admin, linha);
}

/** Aviso de pagamento: avulso (PIX, cartão mês a mês) ou cobrança da assinatura. */
async function tratarPagamento(admin: AdminClient, paymentId: string) {
  const payment = await paymentClient.get({ id: paymentId });
  if (!payment) return;

  // Validação do cartão ao criar a assinatura: devolvida em seguida, não é mensalidade.
  if (ehValidacaoDeCartao(payment)) return;

  const daAssinatura = ehCobrancaDeAssinatura(payment);
  const referencia = payment.external_reference ?? "";
  let userId = UUID.test(referencia) ? referencia : null;

  // Cobrança da assinatura: a linha diz de quem é, mesmo que o Mercado Pago
  // não copie a nossa referência para o pagamento.
  let linha: LinhaAssinatura | null = null;
  if (daAssinatura) {
    const idAssinatura = idAssinaturaDoPagamento(payment);
    if (idAssinatura) {
      linha = await assinaturaPorPreapproval(admin, idAssinatura);
      // Cobrança de uma assinatura que a tabela ainda não liga ao id (criação
      // sem resposta clara): o pagamento traz o id, e a assinatura diz de quem é.
      if (!linha) linha = await adotarAssinatura(admin, await preApprovalClient.get({ id: idAssinatura }));
    }
    if (linha && userId && linha.user_id !== userId) {
      console.error(`[webhook-mp] pagamento ${paymentId}: referência ${userId} diverge da assinatura (${linha.user_id}).`);
      return;
    }
    userId = userId ?? linha?.user_id ?? null;
    if (!linha && userId) linha = await assinaturaViva(admin, userId);
  }

  // Sem dono identificável = pagamento de outro produto na mesma conta do
  // Mercado Pago. Não é nosso: ignora.
  if (!userId) return;

  if (payment.status === "approved") {
    // Idempotente: dias e mensalidade de cupom numa transação só.
    await processarPagamentoAprovado({
      adminClient: admin,
      userId,
      payment,
      origem: "webhook",
      recorrente: daAssinatura,
    });
    if (daAssinatura) await sincronizarSemDerrubar(admin, linha);
  } else if (payment.status === "refunded" || payment.status === "charged_back") {
    // Com o acesso decidido pelas datas, só marcar "past_due" não tirava
    // nada: quem estornava continuava com os dias. Aqui eles voltam.
    await reverterPagamento({
      adminClient: admin,
      paymentId: String(payment.id),
      userId,
      motivo: payment.status,
    });
    // Contestação de uma cobrança automática: a assinatura para, senão o
    // Mercado Pago seguiria cobrando (e sendo contestado) todo mês.
    if (payment.status === "charged_back" && linha?.situacao === "ativa") {
      await cancelarAssinaturaCartao(admin, linha, "sistema");
    }
  } else if (payment.status === "rejected") {
    if (daAssinatura) {
      // O Mercado Pago tenta de novo por até 10 dias; o acesso segue pela
      // tolerância e a tela avisa.
      if (linha) await marcarRecusa(admin, linha);
    } else {
      // Recusa não tira dias já pagos; o status fica como informação.
      await definirStatusAssinatura({
        adminClient: admin,
        userId,
        status: "past_due",
      });
    }
  }
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
      if (!resourceId && bodyData.data?.id) resourceId = String(bodyData.data.id);
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

    const admin = createAdminClient();

    if (topic === "subscription_preapproval" || topic === "preapproval") {
      await tratarAssinatura(admin, resourceId);
    } else if (topic === "subscription_authorized_payment" || topic === "authorized_payment") {
      await tratarFatura(admin, resourceId);
    } else if (topic === "payment") {
      await tratarPagamento(admin, resourceId);
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

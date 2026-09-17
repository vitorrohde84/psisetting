import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { paymentClient } from "@/utils/mercadopago";
import { checkRateLimit } from "@/utils/rate-limit";
import { ativarAssinatura } from "@/utils/subscription-activation";

/**
 * Confirma um pagamento PIX e ativa a assinatura.
 *
 * A06 — docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
 *
 * A versão anterior aceitava qualquer payment_id da query, consultava o
 * Mercado Pago e, se o pagamento estivesse aprovado, ativava a assinatura de
 * quem chamou — SEM nunca comparar o external_reference com o usuário da
 * sessão. Qualquer usuário autenticado que conhecesse um payment_id aprovado
 * da conta do lojista (inclusive o de outro psicólogo) ativava a própria
 * assinatura. E, sem idempotência, a mesma chamada podia ser repetida
 * indefinidamente, somando +30 dias a cada requisição.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const paymentId = url.searchParams.get("payment_id");

    if (!paymentId || !/^\d+$/.test(paymentId)) {
      return NextResponse.json(
        { error: "payment_id inválido." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    // O checkout legítimo consulta o status algumas vezes enquanto o PIX não
    // compensa. 60 por 10 minutos cobre isso com folga e fecha o caminho de
    // varredura de payment_id.
    const rate = await checkRateLimit(`pix-check:${user.id}`, 60, 10 * 60 * 1000);
    if (!rate.success) {
      return NextResponse.json(
        { error: "Muitas verificações seguidas. Aguarde alguns instantes." },
        { status: 429 }
      );
    }

    const payment = await paymentClient.get({ id: paymentId });

    if (!payment) {
      return NextResponse.json(
        { error: "Pagamento não encontrado." },
        { status: 404 }
      );
    }

    // ── A06, o ponto central ──────────────────────────────────────────────
    // O pagamento tem que ser DESTE usuário. external_reference é gravado por
    // nós na criação (subscription/pix e checkout), então é fonte confiável.
    if (payment.external_reference !== user.id) {
      console.warn(
        `[pix/check] usuário ${user.id} consultou pagamento ${paymentId} de external_reference ${payment.external_reference}`
      );
      return NextResponse.json(
        { error: "Pagamento não encontrado." },
        { status: 404 }
      );
    }

    const isApproved = payment.status === "approved";

    if (isApproved) {
      // ativarAssinatura é idempotente: registra o payment_id processado e,
      // numa segunda chamada com o mesmo id, não estende o período de novo.
      await ativarAssinatura({
        adminClient: createAdminClient(),
        userId: user.id,
        paymentId: String(payment.id),
        origem: "pix-check",
      });
    }

    return NextResponse.json({
      status: payment.status,
      approved: isApproved,
      status_detail: payment.status_detail,
    });
  } catch (error: unknown) {
    console.error("Erro ao verificar pagamento PIX:", error);
    return NextResponse.json(
      { error: "Erro ao verificar pagamento." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { paymentClient } from "@/utils/mercadopago";
import { checkRateLimit } from "@/utils/rate-limit";
import { processarPagamentoAprovado } from "@/utils/pagamento-aprovado";
import { vencerPixForaDoPrazo } from "@/utils/pix-cancelamento";

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

    let payment = await paymentClient.get({ id: paymentId });

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

    // Passou dos 15 minutos da tela: cancela no Mercado Pago para o QR deixar
    // de valer no banco (utils/pix-validade.ts). Se tiver sido pago no último
    // instante, volta aprovado e é creditado abaixo.
    payment = await vencerPixForaDoPrazo(payment);

    const isApproved = payment.status === "approved";
    let dias: number | undefined;
    let observacao: string | null | undefined;

    if (isApproved) {
      // Idempotente: dias e mensalidade de cupom são registrados uma vez só,
      // qualquer que seja o caminho que chegar primeiro (este, o webhook ou a
      // reconciliação).
      ({ dias, observacao } = await processarPagamentoAprovado({
        adminClient: createAdminClient(),
        userId: user.id,
        payment,
        origem: "pix-check",
      }));
    }

    return NextResponse.json({
      status: payment.status,
      approved: isApproved,
      // Cancelado (por nós, ao vencer, ou pelo Mercado Pago): a tela para de
      // esperar e oferece um QR novo.
      expirado: payment.status === "cancelled",
      status_detail: payment.status_detail,
      // Dias realmente concedidos (menos de 30 quando o desconto não coube na aprovação).
      dias,
      observacao,
    });
  } catch (error: unknown) {
    console.error("Erro ao verificar pagamento PIX:", error);
    return NextResponse.json(
      { error: "Erro ao verificar pagamento." },
      { status: 500 }
    );
  }
}

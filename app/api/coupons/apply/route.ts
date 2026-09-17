import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { checkRateLimit, getClientIp } from "@/utils/rate-limit";
import { resolverDescontoDeCupom, registrarResgate } from "@/utils/coupons";

const BASE_PRICE = 34.9;

/**
 * Aplica um cupom à conta do psicólogo.
 *
 * A11 — docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
 *
 * A validação e a concessão passaram inteiras para o servidor (service_role):
 * o catálogo de cupons deixou de ser legível pelo usuário, o contador de usos
 * agora sobe de verdade (antes o update era descartado em silêncio por falta de
 * policy, então max_uses nunca era atingido) e o resgate não pode mais ser
 * apagado pelo próprio usuário para reaplicar o mesmo cupom.
 *
 * As colunas de assinatura também deixaram de ser graváveis pelo usuário (A01),
 * então toda escrita aqui usa o client administrativo — sempre amarrada ao
 * user.id da sessão.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateCheck = await checkRateLimit(`coupon:${ip}`, 8, 5 * 60 * 1000);

    if (!rateCheck.success) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
        { status: 429 }
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

    const body = await request.json();
    const rawCode = body?.code;

    if (typeof rawCode !== "string" || !rawCode.trim()) {
      return NextResponse.json(
        { error: "Informe um código de cupom." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const resultado = await resolverDescontoDeCupom({
      adminClient,
      code: rawCode,
      userId: user.id,
      basePrice: BASE_PRICE,
    });

    if (!resultado.valido) {
      return NextResponse.json({ error: resultado.motivo }, { status: 400 });
    }

    const { couponId, code, tipo, valorFinal, trialDays, vip } = resultado;

    // ── Cupom de acesso VIP ───────────────────────────────────────────────
    if (vip) {
      const { registrado } = await registrarResgate({
        adminClient,
        couponId,
        userId: user.id,
      });

      if (!registrado) {
        return NextResponse.json(
          { error: "Você já utilizou este cupom." },
          { status: 400 }
        );
      }

      const { error: vipError } = await adminClient
        .from("profiles")
        .update({ is_vip: true, subscription_status: "vip" })
        .eq("id", user.id);

      if (vipError) {
        console.error("Erro ao conceder VIP:", vipError);
        return NextResponse.json(
          { error: "Erro ao aplicar cupom. Tente novamente." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        is_vip: true,
        message: "Parabéns! Sua conta agora possui Acesso VIP Permanente!",
      });
    }

    // ── Cupom de desconto: só informa o preço, não concede nada ───────────
    // O resgate é registrado apenas quando o pagamento for aprovado, em
    // process-payment. Registrar aqui queimaria o cupom de quem desistisse
    // do checkout.
    if (tipo === "percent" || tipo === "fixed") {
      const desconto = BASE_PRICE - valorFinal;
      const descricao =
        tipo === "percent"
          ? `${Math.round((desconto / BASE_PRICE) * 100)}% OFF`
          : `R$ ${desconto.toFixed(2).replace(".", ",")} OFF`;

      return NextResponse.json({
        success: true,
        discount_type: tipo,
        discount_description: descricao,
        final_amount: valorFinal,
        coupon_code: code,
        message: `Cupom ${code} aplicado com sucesso (${descricao})! De R$ 34,90 por apenas R$ ${valorFinal
          .toFixed(2)
          .replace(".", ",")}/mês.`,
      });
    }

    // ── Cupom de dias de teste ────────────────────────────────────────────
    const dias = trialDays > 0 ? trialDays : 30;

    const { registrado } = await registrarResgate({
      adminClient,
      couponId,
      userId: user.id,
    });

    if (!registrado) {
      return NextResponse.json(
        { error: "Você já utilizou este cupom." },
        { status: 400 }
      );
    }

    const novoFim = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);

    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .update({
        trial_ends_at: novoFim.toISOString(),
        subscription_status: "trialing",
      })
      .eq("id", user.id);

    if (profileUpdateError) {
      console.error("Erro ao atualizar perfil:", profileUpdateError);
      return NextResponse.json(
        { error: "Erro ao atualizar seu período de testes." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      trial_days: dias,
      trial_ends_at: novoFim.toISOString(),
      message: `Cupom aplicado! Você tem ${dias} dias de acesso completo.`,
    });
  } catch (error: unknown) {
    console.error("Erro ao aplicar cupom:", error);
    return NextResponse.json(
      { error: "Erro interno ao aplicar cupom." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkRateLimit, getClientIp } from "@/utils/rate-limit";

const BASE_PRICE = 34.9;

export async function POST(request: Request) {
  try {
    // 🛡️ Proteção Anti-Força Bruta: Máximo 8 tentativas de validação de cupom por IP a cada 5 minutos
    const ip = getClientIp(request);
    const rateCheck = await checkRateLimit(`coupon:${ip}`, 8, 5 * 60 * 1000);
    if (!rateCheck.success) {
      return NextResponse.json(
        { error: "Muitas tentativas de aplicar cupons. Por favor, aguarde alguns minutos antes de tentar novamente." },
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

    if (!rawCode || typeof rawCode !== "string") {
      return NextResponse.json(
        { error: "Por favor, informe o código do cupom." },
        { status: 400 }
      );
    }

    const cleanCode = rawCode.trim().toUpperCase();

    // 1. Buscar cupom no banco
    const { data: coupon, error: couponError } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", cleanCode)
      .single();

    if (couponError || !coupon) {
      return NextResponse.json(
        { error: "Cupom inválido ou não encontrado." },
        { status: 404 }
      );
    }

    if (!coupon.active) {
      return NextResponse.json(
        { error: "Este cupom foi desativado." },
        { status: 400 }
      );
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Este cupom já expirou." },
        { status: 400 }
      );
    }

    if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
      return NextResponse.json(
        { error: "Este cupom atingiu o limite máximo de utilizações." },
        { status: 400 }
      );
    }

    // 2. Verificar se o psicólogo já usou este cupom
    const { data: existingRedemption } = await supabase
      .from("coupon_redemptions")
      .select("id")
      .eq("coupon_id", coupon.id)
      .eq("profile_id", user.id)
      .single();

    if (existingRedemption) {
      return NextResponse.json(
        { error: "Você já utilizou este cupom anteriormente." },
        { status: 400 }
      );
    }

    const discountType = coupon.discount_type || "trial_days";
    const discountValue = Number(coupon.discount_value) || Number(coupon.trial_days) || 30;

    // 3. Caso 1: Cupom de Acesso VIP
    if (discountType === "vip") {
      await supabase
        .from("coupon_redemptions")
        .insert({ coupon_id: coupon.id, profile_id: user.id });

      await supabase
        .from("coupons")
        .update({ uses_count: (coupon.uses_count || 0) + 1 })
        .eq("id", coupon.id);

      await supabase
        .from("profiles")
        .update({ is_vip: true, subscription_status: "vip" })
        .eq("id", user.id);

      return NextResponse.json({
        success: true,
        is_vip: true,
        message: "Parabéns! Sua conta agora possui Acesso VIP Permanente!",
      });
    }

    // 4. Caso 2: Cupom de Desconto (%) ou Valor Fixo (R$)
    if (discountType === "percent" || discountType === "fixed") {
      let finalAmount = BASE_PRICE;
      let discountDescription = "";

      if (discountType === "percent") {
        const discount = (BASE_PRICE * discountValue) / 100;
        finalAmount = Math.max(1, BASE_PRICE - discount);
        discountDescription = `${discountValue}% OFF`;
      } else {
        finalAmount = Math.max(1, BASE_PRICE - discountValue);
        discountDescription = `R$ ${discountValue.toFixed(2).replace(".", ",")} OFF`;
      }

      const formattedFinal = finalAmount.toFixed(2).replace(".", ",");

      return NextResponse.json({
        success: true,
        discount_type: discountType,
        discount_value: discountValue,
        discount_description: discountDescription,
        final_amount: Number(finalAmount.toFixed(2)),
        coupon_code: cleanCode,
        message: `Cupom ${cleanCode} aplicado com sucesso (${discountDescription})! De R$ 34,90 por apenas R$ ${formattedFinal}/mês.`,
      });
    }

    // 5. Caso 3: Cupom de Dias de Teste Grátis
    const now = new Date();
    const targetDays = discountValue;
    const newTrialEndsAt = new Date(
      now.getTime() + targetDays * 24 * 60 * 60 * 1000
    );

    // Registrar o resgate do cupom
    const { error: redemptionError } = await supabase
      .from("coupon_redemptions")
      .insert({
        coupon_id: coupon.id,
        profile_id: user.id,
      });

    if (redemptionError) {
      console.error("Erro ao registrar resgate:", redemptionError);
      return NextResponse.json(
        { error: "Erro ao aplicar cupom. Tente novamente." },
        { status: 500 }
      );
    }

    // Incrementar contador do cupom
    await supabase
      .from("coupons")
      .update({ uses_count: (coupon.uses_count || 0) + 1 })
      .eq("id", coupon.id);

    // Atualizar data de expiração do trial do psicólogo
    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({
        trial_ends_at: newTrialEndsAt.toISOString(),
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
      discount_type: "trial_days",
      trial_days: targetDays,
      trial_ends_at: newTrialEndsAt.toISOString(),
      message: `Cupom ativado com sucesso! Você ganhou +${targetDays} dias de acesso completo sem custos.`,
    });
  } catch (err: any) {
    console.error("Erro geral ao aplicar cupom:", err);
    return NextResponse.json(
      { error: "Erro interno no servidor ao aplicar cupom." },
      { status: 500 }
    );
  }
}

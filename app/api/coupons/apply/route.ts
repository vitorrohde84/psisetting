import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  try {
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

    // 3. Buscar perfil atual para calcular nova data de expiração
    const { data: profile } = await supabase
      .from("profiles")
      .select("trial_ends_at, is_vip, subscription_status")
      .eq("id", user.id)
      .single();

    if (profile?.is_vip) {
      return NextResponse.json({
        message: "Sua conta já possui acesso VIP vitalício.",
        is_vip: true,
      });
    }

    const now = new Date();
    const currentTrialEnd = profile?.trial_ends_at
      ? new Date(profile.trial_ends_at)
      : now;

    // Se o trial já expirou, conta a partir de agora; se ainda está ativo, soma a partir de agora ou da data atual
    const baseDate = currentTrialEnd > now ? currentTrialEnd : now;
    const daysToAdd = coupon.trial_days || 30;
    const newTrialEndsAt = new Date(
      baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000
    );

    // 4. Registrar o resgate do cupom
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

    // 5. Incrementar contador do cupom
    await supabase
      .from("coupons")
      .update({ uses_count: (coupon.uses_count || 0) + 1 })
      .eq("id", coupon.id);

    // 6. Atualizar data de expiração do trial do psicólogo
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
      code: cleanCode,
      trial_days_added: daysToAdd,
      trial_ends_at: newTrialEndsAt.toISOString(),
      message: `Cupom ${cleanCode} aplicado com sucesso! Seu período de teste foi estendido para ${daysToAdd} dias.`,
    });
  } catch (error: any) {
    console.error("Erro ao aplicar cupom:", error);
    return NextResponse.json(
      { error: error?.message || "Erro interno ao processar cupom." },
      { status: 500 }
    );
  }
}

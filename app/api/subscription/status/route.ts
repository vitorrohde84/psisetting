import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("trial_ends_at, subscription_status, is_vip, mp_subscription_id, current_period_end")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Perfil não encontrado." },
        { status: 404 }
      );
    }

    const isVip = Boolean(profile.is_vip);
    const status = profile.subscription_status || "trialing";
    const trialEndsAt = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
    const currentPeriodEnd = profile.current_period_end ? new Date(profile.current_period_end) : null;
    const now = new Date();

    const isPeriodActive = currentPeriodEnd ? currentPeriodEnd > now : false;
    const hasActiveSubscription = isVip || status === "active" || isPeriodActive;

    let isTrialing = false;
    let trialDaysLeft = 0;
    let isExpired = false;

    if (trialEndsAt && !hasActiveSubscription) {
      const diffMs = trialEndsAt.getTime() - now.getTime();
      trialDaysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      isTrialing = diffMs > 0 && status === "trialing";
      isExpired = diffMs <= 0 && status === "trialing";
    }

    // Modo Somente Leitura ocorre quando não é VIP, não tem assinatura ativa e o período de testes acabou
    const isReadOnly = !hasActiveSubscription && isExpired;

    return NextResponse.json({
      isVip,
      status: isVip ? "vip" : hasActiveSubscription ? "active" : status,
      isTrialing,
      trialDaysLeft,
      trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
      currentPeriodEnd: currentPeriodEnd ? currentPeriodEnd.toISOString() : null,
      isReadOnly,
      hasActiveSubscription,
    });
  } catch (error: any) {
    console.error("Erro ao buscar status da assinatura:", error);
    return NextResponse.json(
      { error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}

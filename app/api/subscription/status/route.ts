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
      .select("trial_ends_at, subscription_status, is_vip, mp_subscription_id")
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
    const now = new Date();

    let isTrialing = false;
    let trialDaysLeft = 0;
    let isExpired = false;

    if (trialEndsAt) {
      const diffMs = trialEndsAt.getTime() - now.getTime();
      trialDaysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      isTrialing = diffMs > 0 && status === "trialing";
      isExpired = diffMs <= 0 && status === "trialing";
    }

    // Modo Somente Leitura ocorre quando não é VIP, status não é 'active' e o período de testes acabou
    const isReadOnly = !isVip && status !== "active" && isExpired;

    return NextResponse.json({
      isVip,
      status: isVip ? "vip" : status,
      isTrialing,
      trialDaysLeft,
      trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
      isReadOnly,
      hasActiveSubscription: status === "active" || isVip,
    });
  } catch (error: any) {
    console.error("Erro ao buscar status da assinatura:", error);
    return NextResponse.json(
      { error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}

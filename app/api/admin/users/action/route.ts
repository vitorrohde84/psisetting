import { NextResponse } from "next/server";
import { requireAdmin } from "@/utils/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error || "Não autorizado." }, { status: 403 });
    }

    const body = await request.json();
    const { userId, action, days } = body;

    if (!userId || !action) {
      return NextResponse.json({ error: "Parâmetros 'userId' e 'action' são obrigatórios." }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const now = new Date();

    // 1. Buscar perfil do usuário alvo
    const { data: targetProfile, error: pErr } = await adminClient
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (pErr || !targetProfile) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    let updates: Record<string, any> = {};

    switch (action) {
      case "grant_vip":
        updates = {
          is_vip: true,
          subscription_status: "vip",
        };
        break;

      case "revoke_vip":
        updates = {
          is_vip: false,
          subscription_status: "trialing",
        };
        break;

      case "extend_trial":
        const addDays = Number(days) || 7;
        const currentTrialEnds = targetProfile.trial_ends_at
          ? new Date(targetProfile.trial_ends_at)
          : now;
        const baseDate = currentTrialEnds > now ? currentTrialEnds : now;
        const newTrialDate = new Date(baseDate.getTime() + addDays * 24 * 60 * 60 * 1000);

        updates = {
          trial_ends_at: newTrialDate.toISOString(),
          subscription_status: "trialing",
        };
        break;

      case "make_admin":
        updates = { is_admin: true };
        break;

      case "remove_admin":
        updates = { is_admin: false };
        break;

      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }

    const { error: updateError } = await adminClient
      .from("profiles")
      .update(updates)
      .eq("id", userId);

    if (updateError) {
      console.error("Erro ao executar ação admin no usuário:", updateError);
      return NextResponse.json({ error: "Erro ao atualizar usuário no banco." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Ação executada com sucesso.",
      updates,
    });
  } catch (err: any) {
    console.error("Erro na rota de ação de usuário admin:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

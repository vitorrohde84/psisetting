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

      case "set_trial_days":
        const setDays = Number(days) ?? 7;
        if (setDays <= 0) {
          updates = {
            trial_ends_at: now.toISOString(),
            subscription_status: "expired",
          };
        } else {
          const exactDate = new Date(now.getTime() + setDays * 24 * 60 * 60 * 1000);
          updates = {
            trial_ends_at: exactDate.toISOString(),
            subscription_status: "trialing",
          };
        }
        break;

      case "expire_trial":
        updates = {
          trial_ends_at: now.toISOString(),
          subscription_status: "expired",
        };
        break;

      case "make_admin":
        updates = { is_admin: true };
        break;

      case "remove_admin":
        updates = { is_admin: false };
        break;

      case "delete_user":
        // 1. Proteger conta do administrador principal
        if (userId === auth.user?.id || targetProfile.email === "vitorrohde84@gmail.com") {
          return NextResponse.json(
            { error: "A conta do administrador principal não pode ser excluída." },
            { status: 400 }
          );
        }

        // 2. Excluir dados clínicos e relacionamentos do usuário
        await adminClient.from("prontuarios").delete().eq("psicologo_id", userId);
        await adminClient.from("agendamentos").delete().eq("psicologo_id", userId);
        await adminClient.from("pagamentos").delete().eq("psicologo_id", userId);
        await adminClient.from("laudos").delete().eq("psicologo_id", userId);
        await adminClient.from("diario_bordo").delete().eq("psicologo_id", userId);
        await adminClient.from("pacientes").delete().eq("psicologo_id", userId);
        await adminClient.from("user_feedbacks").delete().eq("user_id", userId);
        await adminClient.from("coupon_redemptions").delete().eq("profile_id", userId);

        // 3. Excluir o perfil da tabela profiles
        await adminClient.from("profiles").delete().eq("id", userId);

        // 4. Excluir de auth.users no Supabase Auth para liberar o e-mail
        try {
          const { error: authDelErr } = await adminClient.auth.admin.deleteUser(userId);
          if (authDelErr) {
            console.warn("Aviso ao deletar de auth.users:", authDelErr);
          }
        } catch (e) {
          console.warn("Exceção ao deletar auth.users:", e);
        }

        return NextResponse.json({
          success: true,
          message: "Usuário e todos os seus dados foram excluídos com sucesso.",
          deleted: true,
          userId,
        });

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

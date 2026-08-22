import { NextResponse } from "next/server";
import { requireAdmin } from "@/utils/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error || "Não autorizado." }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Buscar todos os perfis com campos essenciais
    const { data: profiles, error: pErr } = await adminClient
      .from("profiles")
      .select("id, nome, email, is_vip, is_admin, subscription_status, trial_ends_at, current_period_end, created_at")
      .order("created_at", { ascending: false });

    if (pErr) {
      console.error("Erro ao buscar profiles:", pErr);
      return NextResponse.json({ error: "Erro ao buscar métricas de usuários." }, { status: 500 });
    }

    const allProfiles = profiles || [];
    const totalUsers = allProfiles.length;

    // Categorização dos usuários
    let activeSubscribers = 0;
    let activeTrials = 0;
    let expiredTrials = 0;
    let vips = 0;
    let pastDue = 0;
    let newUsersLast7Days = 0;
    let newUsersLast30Days = 0;

    allProfiles.forEach((p) => {
      const createdAt = p.created_at ? new Date(p.created_at) : null;
      if (createdAt && createdAt >= sevenDaysAgo) newUsersLast7Days++;
      if (createdAt && createdAt >= thirtyDaysAgo) newUsersLast30Days++;

      if (p.is_vip) {
        vips++;
      } else if (p.subscription_status === "active") {
        activeSubscribers++;
      } else if (p.subscription_status === "past_due") {
        pastDue++;
      } else {
        // Status trialing ou indefinido
        const trialEnds = p.trial_ends_at ? new Date(p.trial_ends_at) : null;
        if (trialEnds && trialEnds > now) {
          activeTrials++;
        } else {
          expiredTrials++;
        }
      }
    });

    // 2. Cálculos Financeiros (R$ 34,90/mês)
    const TICKET_PRICE = 34.9;
    const mrr = activeSubscribers * TICKET_PRICE;
    const arr = mrr * 12;
    const conversionRate = totalUsers > 0 ? (activeSubscribers / totalUsers) * 100 : 0;

    // 3. Contagem global de engajamento clínico (com fallback seguro caso tabelas estejam vazias)
    const [
      { count: totalPacientes },
      { count: totalProntuarios },
      { count: totalLaudos },
      { count: totalAgendamentos },
    ] = await Promise.all([
      adminClient.from("pacientes").select("*", { count: "exact", head: true }),
      adminClient.from("prontuarios").select("*", { count: "exact", head: true }),
      adminClient.from("laudos").select("*", { count: "exact", head: true }),
      adminClient.from("agendamentos").select("*", { count: "exact", head: true }),
    ]);

    // 4. Feedbacks pendentes (com fallback seguro caso a tabela esteja sendo criada)
    let pendingFeedbacks = 0;
    try {
      const { count } = await adminClient
        .from("user_feedbacks")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      pendingFeedbacks = count || 0;
    } catch {
      pendingFeedbacks = 0;
    }

    // 5. Cupons ativos
    let activeCouponsCount = 0;
    try {
      const { count } = await adminClient
        .from("coupons")
        .select("*", { count: "exact", head: true })
        .eq("active", true);
      activeCouponsCount = count || 0;
    } catch {
      activeCouponsCount = 0;
    }

    return NextResponse.json({
      finance: {
        mrr,
        arr,
        ticketPrice: TICKET_PRICE,
        activeSubscribers,
        pastDue,
      },
      users: {
        total: totalUsers,
        activeTrials,
        expiredTrials,
        vips,
        newLast7Days: newUsersLast7Days,
        newLast30Days: newUsersLast30Days,
        conversionRate: Number(conversionRate.toFixed(1)),
      },
      engagement: {
        totalPacientes: totalPacientes || 0,
        totalProntuarios: totalProntuarios || 0,
        totalLaudos: totalLaudos || 0,
        totalAgendamentos: totalAgendamentos || 0,
      },
      operations: {
        pendingFeedbacks,
        activeCouponsCount,
      },
      recentProfiles: allProfiles.slice(0, 8),
    });
  } catch (err: any) {
    console.error("Erro na rota de métricas admin:", err);
    return NextResponse.json({ error: "Erro interno ao carregar métricas." }, { status: 500 });
  }
}

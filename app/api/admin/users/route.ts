import { NextResponse } from "next/server";
import { isEmailAdmin, requireAdmin } from "@/utils/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { calcularAcesso } from "@/utils/acesso-assinatura";
import { carregarAssinaturasAdmin } from "@/utils/assinatura-admin";

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error || "Não autorizado." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const filterStatus = searchParams.get("status") || "all"; // 'all', 'active', 'trialing', 'expired', 'vip', 'risk'

    const adminClient = createAdminClient();
    const now = new Date();

    // 1. Buscar todos os perfis
    let query = adminClient
      .from("profiles")
      .select("id, nome, email, telefone, crp, is_vip, is_admin, subscription_status, trial_ends_at, current_period_end, created_at")
      .order("created_at", { ascending: false });

    const { data: profiles, error } = await query;

    if (error) {
      console.error("Erro ao buscar usuários admin:", error);
      return NextResponse.json({ error: "Erro ao buscar lista de usuários." }, { status: 500 });
    }

    // 2. Buscar contagem de pacientes por psicólogo para identificar atividade/risco
    const { data: patientCounts } = await adminClient
      .from("pacientes")
      .select("psicologo_id");

    const patientMap: Record<string, number> = {};
    (patientCounts || []).forEach((p: any) => {
      if (p.psicologo_id) {
        patientMap[p.psicologo_id] = (patientMap[p.psicologo_id] || 0) + 1;
      }
    });

    // 3. Cupom em uso e forma do último pagamento de cada conta.
    const assinaturas = await carregarAssinaturasAdmin(adminClient);

    // 4. Processar e classificar cada usuário — pela mesma regra de acesso que
    // o sistema aplica (as datas). Antes o painel classificava pelo status
    // gravado e mostrava "Assinante Ativo" para quem pagou uma vez há meses.
    const statusPorSituacao = {
      vip: "vip",
      ativo: "active",
      teste: "trialing",
      vencido: "expired",
    } as const;

    const processedUsers = (profiles || []).map((p) => {
      // Admin conta como VIP, como em /api/subscription/status.
      const acesso = calcularAcesso({
        isVip: p.is_vip || p.is_admin || isEmailAdmin(p.email),
        trialEndsAt: p.trial_ends_at,
        currentPeriodEnd: p.current_period_end,
        agora: now,
      });
      const calculatedStatus = statusPorSituacao[acesso.situacao];
      const trialDaysLeft = acesso.diasRestantesTeste;
      const assinatura = assinaturas[p.id];

      const totalPatients = patientMap[p.id] || 0;
      
      // Risco de Churn: Trial ativo com menos de 3 dias restantes OU cadastrado há mais de 3 dias com 0 pacientes
      const createdAt = p.created_at ? new Date(p.created_at) : null;
      const daysSinceCreation = createdAt ? Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      const isAtRisk = (calculatedStatus === "trialing" && trialDaysLeft <= 2) || (calculatedStatus === "trialing" && daysSinceCreation >= 2 && totalPatients === 0);

      return {
        ...p,
        calculatedStatus,
        trialDaysLeft,
        diasParaVencer: acesso.diasParaVencer,
        acessoAte: acesso.acessoAte,
        cupomEmUso: assinatura?.cupomEmUso ?? null,
        ultimoMeio: assinatura?.ultimoMeio ?? null,
        ultimoPagamentoEm: assinatura?.ultimoPagamentoEm ?? null,
        totalPatients,
        daysSinceCreation,
        isAtRisk,
      };
    });

    // 5. Aplicar Filtros em Memória
    let filteredUsers = processedUsers;

    if (search) {
      filteredUsers = filteredUsers.filter(
        (u) =>
          (u.nome && u.nome.toLowerCase().includes(search)) ||
          (u.email && u.email.toLowerCase().includes(search)) ||
          (u.crp && u.crp.toLowerCase().includes(search)) ||
          (u.telefone && u.telefone.toLowerCase().includes(search))
      );
    }

    if (filterStatus !== "all") {
      if (filterStatus === "risk") {
        filteredUsers = filteredUsers.filter((u) => u.isAtRisk);
      } else {
        filteredUsers = filteredUsers.filter((u) => u.calculatedStatus === filterStatus);
      }
    }

    return NextResponse.json({ users: filteredUsers, total: filteredUsers.length });
  } catch (err: any) {
    console.error("Erro na listagem de usuários admin:", err);
    return NextResponse.json({ error: "Erro interno ao processar usuários." }, { status: 500 });
  }
}

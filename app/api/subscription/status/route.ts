import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { calcularAcesso } from "@/utils/acesso-assinatura";
import { isEmailAdmin } from "@/utils/admin-auth";
import { checkRateLimit } from "@/utils/rate-limit";
import { reconciliarPagamentos } from "@/utils/reconciliar-pagamentos";
import { renovacaoParaTela } from "@/utils/assinatura-cartao";
import {
  assinaturaMaisRecente,
  resolverCriacaoPendente,
  type LinhaAssinatura,
} from "@/utils/assinatura-cartao-servidor";

/**
 * Situação da assinatura de quem está logado.
 *
 * O acesso é decidido pelas DATAS (utils/acesso-assinatura.ts), não pelo
 * status gravado. Antes, `status === "active"` dava acesso para sempre a quem
 * pagou uma vez, e contas canceladas, com pagamento recusado ou com teste
 * expirado pelo admin nunca entravam em somente leitura.
 *
 * Com a renovação automática ligada, o acesso tem a tolerância de cartão
 * recusado (10 dias depois do período pago) e a tela recebe a próxima
 * cobrança, o valor e o final do cartão em `renovacao`.
 */

/** No máximo ~3 s em qualquer consulta ao Mercado Pago feita daqui. */
function comTeto<T>(p: Promise<T>, reserva: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(reserva), 3000))]);
}

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

    const colunas = "trial_ends_at, subscription_status, is_vip, is_admin, current_period_end";
    const { data: perfilLido, error: profileError } = await supabase
      .from("profiles")
      .select(colunas)
      .eq("id", user.id)
      .single();
    // `let` porque o perfil é relido abaixo se a reconciliação liberar dias.
    let profile = perfilLido;

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Perfil não encontrado." },
        { status: 404 }
      );
    }

    // Renovação automática: a tabela só é legível pelo servidor. Uma falha
    // aqui não derruba a tela — a pessoa só fica sem a tolerância nesta
    // consulta, e a próxima tenta de novo.
    let assinatura: LinhaAssinatura | null = null;
    try {
      const admin = createAdminClient();
      assinatura = await assinaturaMaisRecente(admin, user.id);

      // Criação que ficou sem resposta do Mercado Pago: procura lá, sem
      // segurar a tela (a conferência diária também resolve).
      if (assinatura?.situacao === "criando") {
        const limite = await checkRateLimit(`resolver-assinatura:${user.id}`, 1, 2 * 60 * 1000);
        if (limite.success) {
          const situacao = await comTeto(resolverCriacaoPendente(admin, assinatura), "criando" as const);
          if (situacao !== "criando") assinatura = await assinaturaMaisRecente(admin, user.id);
        }
      }
    } catch (err) {
      console.error("[status] renovação automática não lida:", err);
    }

    // Conta de administrador nunca fica em somente leitura: é quem opera o
    // sistema, e antes o status gravado cobria isso por acaso.
    const isAdmin = Boolean(profile.is_admin) || isEmailAdmin(user.email);
    const renovacaoAutomatica = assinatura?.situacao === "ativa";
    const renovacaoDesde = assinatura?.criada_em ?? null;
    let acesso = calcularAcesso({
      isVip: Boolean(profile.is_vip) || isAdmin,
      trialEndsAt: profile.trial_ends_at,
      currentPeriodEnd: profile.current_period_end,
      renovacaoAutomatica,
      renovacaoDesde,
    });

    // Prestes a entrar em somente leitura: antes de bloquear, pergunta ao
    // Mercado Pago se existe pagamento aprovado que ainda não virou dias
    // (cartão em análise, PIX pago com o modal fechado, webhook perdido).
    // Limitado para não consultar o Mercado Pago a cada tela.
    if (acesso.situacao === "vencido") {
      const limite = await checkRateLimit(`reconciliar:${user.id}`, 1, 2 * 60 * 1000);
      if (limite.success) {
        try {
          // No máximo ~3 s: esta rota é chamada ao abrir qualquer tela, e o
          // Mercado Pago lento não pode segurar a interface. Se estourar, a
          // próxima consulta (ou o webhook) termina o trabalho.
          const { processados } = await comTeto(
            reconciliarPagamentos({ adminClient: createAdminClient(), userId: user.id }),
            { processados: 0 }
          );
          if (processados > 0) {
            const releitura = await supabase.from("profiles").select(colunas).eq("id", user.id).single();
            if (releitura.error) {
              console.error("[status] perfil não relido depois da reconciliação:", releitura.error.message);
            } else if (releitura.data) {
              profile = releitura.data;
              acesso = calcularAcesso({
                isVip: Boolean(profile.is_vip) || isAdmin,
                trialEndsAt: profile.trial_ends_at,
                currentPeriodEnd: profile.current_period_end,
                renovacaoAutomatica,
                renovacaoDesde,
              });
            }
          }
        } catch (err) {
          // Falha na consulta não pode derrubar a tela: a pessoa vê o estado
          // atual e a próxima tentativa (ou o webhook) resolve.
          console.error("[status] reconciliação falhou:", err);
        }
      }
    }

    const statusPorSituacao = {
      vip: "vip",
      ativo: "active",
      teste: "trialing",
      vencido: "expired",
    } as const;

    return NextResponse.json({
      // "vip" inclui a conta de administrador: as telas tratam as duas igual
      // (sem cobrança). Antes o admin tinha acesso de VIP mas via o modal de pagar.
      isVip: acesso.situacao === "vip",
      status: statusPorSituacao[acesso.situacao],
      situacao: acesso.situacao,
      isTrialing: acesso.situacao === "teste",
      trialDaysLeft: acesso.diasRestantesTeste,
      trialEndsAt: profile?.trial_ends_at ?? null,
      // Até quando o acesso vai de fato (o maior entre pago e teste), para o
      // "Ativo até" e o aviso de vencimento não mostrarem uma data menor.
      currentPeriodEnd:
        acesso.situacao === "ativo" ? acesso.acessoAte : profile?.current_period_end ?? null,
      diasParaVencer: acesso.diasParaVencer,
      isReadOnly: acesso.somenteLeitura,
      hasActiveSubscription: acesso.situacao === "vip" || acesso.situacao === "ativo",
      // O período pago acabou e o acesso segue pela tolerância do cartão.
      emCarencia: acesso.emCarencia,
      // VIP não tem cobrança: nada de renovação na tela, mesmo que sobre linha antiga.
      renovacao: acesso.situacao === "vip" ? null : renovacaoParaTela(assinatura),
    });
  } catch (error: unknown) {
    console.error("Erro ao buscar status da assinatura:", error);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

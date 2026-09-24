import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ativação de assinatura — ponto único e idempotente.
 *
 * A05/A06/A08 — docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
 *
 * Antes, três caminhos diferentes (process-payment, pix/check e o webhook)
 * escreviam subscription_status e current_period_end cada um do seu jeito, com
 * o cliente do usuário e sem registro do que já tinha sido processado. Isso
 * produzia: (a) replay somando +30 dias por requisição repetida; (b) o caminho
 * "approved" do webhook gravando status ativo SEM current_period_end, o que
 * fazia a assinatura nunca expirar.
 *
 * Aqui a ativação é uma função só, que:
 *   1. registra o payment_id numa tabela com UNIQUE — segunda chamada com o
 *      mesmo id não estende nada (idempotência real, garantida pelo banco);
 *   2. estende a partir do maior entre agora e o período vigente, para não
 *      encurtar quem paga adiantado;
 *   3. escreve sempre com service_role, porque as colunas de assinatura
 *      deixaram de ser graváveis pelo próprio usuário (A01).
 */

const DIAS_PERIODO = 30;

interface AtivarParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: SupabaseClient<any, any, any>;
  userId: string;
  /** Identificador do pagamento no Mercado Pago. Chave de idempotência. */
  paymentId: string;
  origem: "process-payment" | "pix-check" | "webhook" | "reconciliacao" | "cron";
  diasPeriodo?: number;
}

export interface AtivarResultado {
  aplicado: boolean;
  jaProcessado: boolean;
  periodoFim?: string;
}

export async function ativarAssinatura({
  adminClient,
  userId,
  paymentId,
  origem,
  diasPeriodo = DIAS_PERIODO,
}: AtivarParams): Promise<AtivarResultado> {
  // 1. Trava de idempotência no banco. A constraint UNIQUE é o mecanismo —
  //    verificar antes e inserir depois voltaria a abrir a corrida.
  const { error: eventoError } = await adminClient
    .from("payment_events")
    .insert({ payment_id: paymentId, user_id: userId, origem });

  if (eventoError) {
    // 23505 = unique_violation: este pagamento já foi processado.
    if (eventoError.code === "23505") {
      return { aplicado: false, jaProcessado: true };
    }
    throw eventoError;
  }

  // 2. Base da extensão: nunca encurta um período já pago nem o teste em
  //    andamento. Antes, trial_ends_at era sobrescrito com o fim do período:
  //    quem tinha 90 dias de teste por cupom e pagava no dia 1 caía para 30.
  //    Desde a entrega 1 este é o caminho de RESERVA — o normal é a função
  //    processar_pagamento_aprovado do banco (utils/pagamento-aprovado.ts).
  const { data: perfil } = await adminClient
    .from("profiles")
    .select("current_period_end, trial_ends_at")
    .eq("id", userId)
    .single();

  const agora = new Date();
  const futuros = [perfil?.current_period_end, perfil?.trial_ends_at]
    .filter(Boolean)
    .map((d) => new Date(String(d)).getTime())
    .filter((t) => Number.isFinite(t) && t > agora.getTime());
  const base = futuros.length ? new Date(Math.max(...futuros)) : agora;
  const novoFim = new Date(base.getTime() + diasPeriodo * 24 * 60 * 60 * 1000);

  // 3. Escrita com service_role.
  const { error: updateError } = await adminClient
    .from("profiles")
    .update({
      subscription_status: "active",
      current_period_end: novoFim.toISOString(),
    })
    .eq("id", userId);

  if (updateError) {
    // Falha alto: sem isto, o psicólogo paga e não recebe acesso, e ninguém
    // fica sabendo. Era exatamente o modo de falha do webhook antigo.
    console.error(
      `[assinatura] pagamento ${paymentId} (${origem}) registrado mas perfil ${userId} não foi atualizado:`,
      updateError
    );
    throw updateError;
  }

  return {
    aplicado: true,
    jaProcessado: false,
    periodoFim: novoFim.toISOString(),
  };
}

/**
 * Marca a assinatura como não-ativa. Usado pelo webhook em cancelamento,
 * pausa ou estorno. Não usa idempotência por payment_id porque é uma
 * mudança de estado, não uma concessão de período.
 */
export async function definirStatusAssinatura({
  adminClient,
  userId,
  status,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: SupabaseClient<any, any, any>;
  userId: string;
  status: "canceled" | "past_due" | "trialing";
}): Promise<void> {
  const { error } = await adminClient
    .from("profiles")
    .update({ subscription_status: status })
    .eq("id", userId);

  if (error) {
    console.error(`[assinatura] falha ao definir status ${status} para ${userId}:`, error);
    throw error;
  }
}

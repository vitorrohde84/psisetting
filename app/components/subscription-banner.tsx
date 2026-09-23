"use client";

import { useSubscription } from "@/utils/subscription-context";
import { avisoDeVencimento, prazoDeVencimento } from "@/utils/assinatura-tela";
import { Sparkles, AlertTriangle, ArrowRight, Tag, CalendarClock, Clock } from "lucide-react";

export function SubscriptionBanner() {
  const {
    isVip,
    isReadOnly,
    isTrialing,
    trialDaysLeft,
    hasActiveSubscription,
    diasParaVencer,
    currentPeriodEnd,
    loading,
    aguardandoPagamento,
    openSubscriptionModal,
    openSubscriptionModalComCupom,
  } = useSubscription();

  if (loading) return null;

  // Pagamento esperando confirmação (cartão em análise, PIX pago com o modal
  // fechado ou com o QR vencido): "Reativar acesso" ou "Renovar" aqui
  // convidariam a pagar de novo. Quando a confirmação chega, o status muda e
  // esta faixa sai sozinha; se não chegar em 15 min, voltam as de sempre.
  if (aguardandoPagamento && !isVip) {
    return (
      <div role="status" className="bg-secondary/15 border-b border-secondary/40 px-4 py-2 text-xs text-text shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <Clock size={14} className="text-primary shrink-0" />
            <span>
              <strong>Aguardando a confirmação do pagamento.</strong> Se você já pagou, o acesso é atualizado aqui
              sozinho em alguns minutos — não precisa pagar de novo.
            </span>
          </div>

          <button
            type="button"
            onClick={openSubscriptionModal}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface border border-border text-text-muted hover:text-text hover:bg-background transition-colors text-xs cursor-pointer shrink-0"
          >
            <span>Abrir assinatura</span>
          </button>
        </div>
      </div>
    );
  }

  // O pagamento é avulso (sem débito automático): sem este aviso, quem paga
  // mês a mês só descobre que venceu quando tenta salvar um registro.
  const aviso = avisoDeVencimento({ hasActiveSubscription, isVip, diasParaVencer, currentPeriodEnd });
  if (aviso) {
    const prazo = prazoDeVencimento(aviso.dias);
    return (
      <div className="bg-secondary/15 border-b border-secondary/40 px-4 py-2 text-xs text-text shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <CalendarClock size={14} className="text-primary shrink-0" />
            <span>
              <strong>
                Seu acesso {prazo}
                {aviso.data ? ` (${aviso.data})` : ""}.
              </strong>{" "}
              Renove para continuar criando registros — nada do que já está salvo se perde.
            </span>
          </div>

          <button
            type="button"
            onClick={openSubscriptionModal}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark transition-all text-xs cursor-pointer shadow-2xs shrink-0"
          >
            <span>Renovar</span>
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    );
  }

  // Se a conta for VIP ou já tiver assinatura ativa (longe de vencer), não exibe banner
  if (isVip || hasActiveSubscription) return null;

  // 1. Banner para Modo Somente Leitura (fim do teste OU do período pago)
  if (isReadOnly) {
    return (
      <div className="bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-xs text-text shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <AlertTriangle size={15} className="text-amber-700 shrink-0" />
            <span>
              <strong>Modo Somente Leitura Ativo:</strong> Seu acesso terminou. Seus registros anteriores continuam 100% seguros e acessíveis conforme as regras do CFP. Para criar novos registros, reative o acesso ou use um cupom.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Sem preço no botão: quem tem cupom em uso paga menos que o
                preço cheio, e o valor certo aparece no modal. */}
            <button
              type="button"
              onClick={openSubscriptionModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-white font-bold hover:bg-primary-dark transition-all cursor-pointer shadow-2xs"
            >
              <span>Reativar acesso</span>
              <ArrowRight size={13} />
            </button>
            <button
              type="button"
              onClick={openSubscriptionModalComCupom}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-text font-semibold hover:bg-background transition-colors cursor-pointer"
            >
              <Tag size={12} className="text-primary" />
              <span>Cupom</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Banner para Período de Testes Ativo
  if (isTrialing) {
    return (
      <div className="bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 border-b border-primary/20 px-4 py-2 text-xs text-text shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-secondary shrink-0" />
            <span>
              <strong>Período de Teste Gratuito:</strong> Você tem{" "}
              <strong className="text-primary font-bold">{trialDaysLeft} {trialDaysLeft === 1 ? "dia restante" : "dias restantes"}</strong> para experimentar todos os recursos.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openSubscriptionModal}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark transition-all text-xs cursor-pointer shadow-2xs"
            >
              <span>Assinar Plano</span>
              <ArrowRight size={12} />
            </button>
            <button
              type="button"
              onClick={openSubscriptionModalComCupom}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface border border-border text-text-muted hover:text-text hover:bg-background transition-colors text-xs cursor-pointer"
            >
              <Tag size={12} className="text-primary" />
              <span>Tenho um Cupom</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

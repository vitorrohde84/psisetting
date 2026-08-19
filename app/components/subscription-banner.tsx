"use client";

import { useSubscription } from "@/utils/subscription-context";
import { Sparkles, AlertTriangle, ArrowRight, Tag, ShieldCheck } from "lucide-react";

export function SubscriptionBanner() {
  const {
    isVip,
    isReadOnly,
    isTrialing,
    trialDaysLeft,
    hasActiveSubscription,
    loading,
    openSubscriptionModal,
  } = useSubscription();

  if (loading) return null;

  // Se a conta for VIP ou já tiver assinatura ativa, não exibe banner
  if (isVip || hasActiveSubscription) return null;

  // 1. Banner para Modo Somente Leitura (Trial Expirado)
  if (isReadOnly) {
    return (
      <div className="bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-xs text-text shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <AlertTriangle size={15} className="text-amber-700 shrink-0" />
            <span>
              <strong>Modo Somente Leitura Ativo:</strong> Seu período de testes terminou. Seus registros anteriores continuam 100% seguros e acessíveis conforme as regras do CFP. Para criar novos registros, assine o plano ou insira um cupom.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openSubscriptionModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-white font-bold hover:bg-primary-dark transition-all cursor-pointer shadow-2xs"
            >
              <span>Assinar (R$ 29,90/mês)</span>
              <ArrowRight size={13} />
            </button>
            <button
              type="button"
              onClick={openSubscriptionModal}
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
              onClick={openSubscriptionModal}
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

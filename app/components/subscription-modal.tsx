"use client";

import { useState } from "react";
import { useSubscription } from "@/utils/subscription-context";
import {
  X,
  Sparkles,
  Check,
  Tag,
  Lock,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Loader2,
} from "lucide-react";

export function SubscriptionModal() {
  const {
    isModalOpen,
    closeSubscriptionModal,
    isReadOnly,
    isTrialing,
    trialDaysLeft,
    isVip,
    hasActiveSubscription,
    refreshSubscription,
  } = useSubscription();

  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMessage, setCouponMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  if (!isModalOpen) return null;

  async function handleApplyCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!couponCode.trim()) return;

    setCouponLoading(true);
    setCouponMessage(null);

    try {
      const res = await fetch("/api/coupons/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCouponMessage({ type: "error", text: data.error || "Erro ao aplicar cupom." });
      } else {
        setCouponMessage({ type: "success", text: data.message });
        setCouponCode("");
        await refreshSubscription();
      }
    } catch (err: any) {
      setCouponMessage({ type: "error", text: "Erro de conexão ao aplicar cupom." });
    } finally {
      setCouponLoading(false);
    }
  }

  async function handleCheckout() {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Erro ao iniciar pagamento com Mercado Pago.");
        setCheckoutLoading(false);
        return;
      }

      if (data.init_point) {
        // Redireciona para o checkout do Mercado Pago
        window.location.href = data.init_point;
      } else {
        alert("Link de pagamento não retornado.");
        setCheckoutLoading(false);
      }
    } catch (err) {
      console.error("Erro no checkout:", err);
      alert("Erro ao conectar com o serviço de pagamentos.");
      setCheckoutLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-surface border border-border/80 shadow-2xl p-6 sm:p-8 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Botão Fechar */}
        <button
          type="button"
          onClick={closeSubscriptionModal}
          className="absolute top-5 right-5 p-2 rounded-xl text-text-muted hover:text-text hover:bg-background transition-colors cursor-pointer"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>

        {/* Status do Período */}
        <div className="mb-5">
          {isReadOnly ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-200">
              <AlertTriangle size={13} className="text-amber-700" />
              <span>Modo Somente Leitura Ativo</span>
            </div>
          ) : isTrialing ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
              <Sparkles size={13} />
              <span>Período de Teste: {trialDaysLeft} dias restantes</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">
              <ShieldCheck size={13} />
              <span>Plano Profissional PsiSetting</span>
            </div>
          )}

          <h2 className="text-2xl font-serif font-bold text-text mt-3">
            Plano Profissional Clínico
          </h2>
          <p className="text-xs sm:text-sm text-text-muted mt-1 leading-relaxed">
            Tenha acesso completo e ilimitado a todas as ferramentas do seu consultório digital.
          </p>
        </div>

        {/* Preço em Destaque */}
        <div className="p-4.5 rounded-2xl bg-gradient-to-r from-primary/10 via-surface to-secondary/10 border border-primary/20 flex items-baseline justify-between mb-5">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Assinatura Mensal</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-sm font-bold text-text">R$</span>
              <span className="text-3xl font-serif font-black text-text">29</span>
              <span className="text-lg font-serif font-bold text-text">,90</span>
              <span className="text-xs text-text-muted">/mês</span>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
            Sem fidelidade
          </span>
        </div>

        {/* Recursos Incluídos */}
        <div className="space-y-2.5 text-xs text-text mb-6">
          {[
            "Pacientes e prontuários ilimitados",
            "5 modelos oficiais CFP (Resolução 06/2019)",
            "Modo Privacidade em 1 clique",
            "Criptografia AES-256 e conformidade com CFP/LGPD",
            "Sincronização com Google Agenda e Apple Calendar",
            "Controle financeiro de sessões e recibos",
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="p-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                <Check size={12} strokeWidth={3} />
              </div>
              <span>{item}</span>
            </div>
          ))}
        </div>

        {/* Botão de Pagamento com Mercado Pago */}
        <button
          type="button"
          onClick={handleCheckout}
          disabled={checkoutLoading}
          className="w-full py-3.5 px-5 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-all flex items-center justify-center gap-2 text-sm shadow-md hover:shadow-lg cursor-pointer disabled:opacity-60 mb-6"
        >
          {checkoutLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Gerando Checkout Mercado Pago...</span>
            </>
          ) : (
            <>
              <span>Assinar com Mercado Pago (R$ 29,90/mês)</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>

        {/* Seção de Inserção de Cupom */}
        <div className="pt-5 border-t border-border/60">
          <div className="flex items-center gap-1.5 text-xs font-bold text-text mb-2">
            <Tag size={13} className="text-secondary" />
            <span>Possui um cupom de parceiro ou período estendido?</span>
          </div>

          <form onSubmit={handleApplyCoupon} className="flex gap-2">
            <input
              type="text"
              placeholder="Digite o código (ex: PSI30)"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              className="flex-1 px-3.5 py-2 rounded-xl bg-background border border-border/80 text-xs text-text placeholder:text-text-muted uppercase font-mono tracking-wider focus:outline-hidden focus:border-primary"
            />
            <button
              type="submit"
              disabled={couponLoading || !couponCode.trim()}
              className="px-4 py-2 rounded-xl bg-surface border border-border text-xs font-bold text-text hover:bg-background hover:border-primary/40 transition-all cursor-pointer disabled:opacity-50 shrink-0"
            >
              {couponLoading ? <Loader2 size={14} className="animate-spin" /> : "Aplicar"}
            </button>
          </form>

          {couponMessage && (
            <p
              className={`text-xs mt-2 font-medium ${
                couponMessage.type === "success" ? "text-emerald-700" : "text-rose-600"
              }`}
            >
              {couponMessage.text}
            </p>
          )}
        </div>

        {/* Garantia e Sigilo */}
        <p className="text-[11px] text-center text-text-muted mt-5 flex items-center justify-center gap-1">
          <Lock size={11} className="text-emerald-600" />
          <span>Pagamento seguro via Mercado Pago · Cancele quando quiser</span>
        </p>
      </div>
    </div>
  );
}

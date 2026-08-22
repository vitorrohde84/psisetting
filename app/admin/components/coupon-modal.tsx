"use client";

import { useState } from "react";
import { X, Tag, Plus, Loader2, Clock, Percent, DollarSign, Crown, Sparkles } from "lucide-react";

interface CouponModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type DiscountType = "trial_days" | "percent" | "fixed" | "vip";

export function CouponModal({ isOpen, onClose, onSuccess }: CouponModalProps) {
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("trial_days");
  const [discountValue, setDiscountValue] = useState<number>(30);
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const BASE_PRICE = 34.9;

  function calculatePreviewPrice() {
    if (discountType === "percent") {
      const discount = (BASE_PRICE * Number(discountValue)) / 100;
      const finalPrice = Math.max(1, BASE_PRICE - discount);
      return finalPrice.toFixed(2).replace(".", ",");
    }
    if (discountType === "fixed") {
      const finalPrice = Math.max(1, BASE_PRICE - Number(discountValue));
      return finalPrice.toFixed(2).replace(".", ",");
    }
    return "34,90";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError("Código do cupom é obrigatório.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          discount_type: discountType,
          discount_value: Number(discountValue) || 0,
          trial_days: discountType === "trial_days" ? Number(discountValue) || 30 : 30,
          max_uses: maxUses ? Number(maxUses) : null,
          expires_at: expiresAt || null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setCode("");
        setDiscountType("trial_days");
        setDiscountValue(30);
        setMaxUses("");
        setExpiresAt("");
        onSuccess();
        onClose();
      } else {
        setError(data.error || "Erro ao criar cupom.");
      }
    } catch (err) {
      setError("Falha ao salvar cupom no servidor.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-lg bg-surface rounded-2xl shadow-2xl border border-border/80 p-6 space-y-5 max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Tag size={18} />
            </div>
            <div>
              <h3 className="font-serif font-bold text-text text-base">
                Criar Novo Cupom Promocional
              </h3>
              <p className="text-xs text-text-muted">
                Dias de teste, descontos em % ou valor em reais
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-background transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Código do Cupom */}
          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Código do Cupom *
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ex: PROMO20, DESCONTO10, HELLEN30"
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs font-mono font-bold text-text uppercase focus:border-primary focus:ring-1 focus:ring-primary outline-hidden tracking-wider"
            />
          </div>

          {/* Seletor de Tipo de Benefício */}
          <div>
            <label className="block text-xs font-semibold text-text mb-2">
              Tipo de Benefício do Cupom *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "trial_days", label: "Dias de Teste", desc: "Acesso grátis extra", icon: Clock },
                { id: "percent", label: "Desconto (%)", desc: "Porcentagem OFF", icon: Percent },
                { id: "fixed", label: "Desconto Fixo (R$)", desc: "Valor em reais OFF", icon: DollarSign },
                { id: "vip", label: "Acesso VIP", desc: "Cortesia Vitalícia", icon: Crown },
              ].map((t) => {
                const Icon = t.icon;
                const isSelected = discountType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setDiscountType(t.id as DiscountType);
                      if (t.id === "trial_days") setDiscountValue(30);
                      if (t.id === "percent") setDiscountValue(20);
                      if (t.id === "fixed") setDiscountValue(10);
                    }}
                    className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-2xs font-bold text-primary"
                        : "border-border/80 bg-background/50 hover:bg-background text-text"
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg shrink-0 ${isSelected ? "bg-primary text-white" : "bg-border/60 text-text-muted"}`}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs">{t.label}</p>
                      <p className="text-[10px] text-text-muted font-normal truncate">{t.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Campo de Valor do Benefício (Dependendo do Tipo) */}
          {discountType !== "vip" && (
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                {discountType === "trial_days" && "Quantidade de Dias Grátis *"}
                {discountType === "percent" && "Porcentagem de Desconto (% OFF) *"}
                {discountType === "fixed" && "Valor do Desconto em Reais (R$ OFF) *"}
              </label>

              <div className="relative">
                <input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                  min={1}
                  max={discountType === "percent" ? 100 : 365}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs font-bold text-text focus:border-primary outline-hidden"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted">
                  {discountType === "trial_days" && "dias"}
                  {discountType === "percent" && "% OFF"}
                  {discountType === "fixed" && "R$ OFF"}
                </span>
              </div>
            </div>
          )}

          {/* Preview Dinâmico de Preço */}
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2.5 text-xs text-text leading-relaxed">
            <Sparkles size={16} className="text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-primary">Simulação do Impacto:</p>
              {discountType === "trial_days" && (
                <p className="text-text-muted text-[11px]">
                  O psicólogo ganha <strong>+{discountValue} dias de teste completo</strong> sem cobrança.
                </p>
              )}
              {discountType === "percent" && (
                <p className="text-text-muted text-[11px]">
                  Com <strong>{discountValue}% OFF</strong>, o plano de R$ 34,90 passa a custar{" "}
                  <strong className="text-emerald-800">R$ {calculatePreviewPrice()}/mês</strong>.
                </p>
              )}
              {discountType === "fixed" && (
                <p className="text-text-muted text-[11px]">
                  Com <strong>R$ {discountValue},00 OFF</strong>, o plano de R$ 34,90 passa a custar{" "}
                  <strong className="text-emerald-800">R$ {calculatePreviewPrice()}/mês</strong>.
                </p>
              )}
              {discountType === "vip" && (
                <p className="text-text-muted text-[11px]">
                  A conta do psicólogo é liberada como <strong>VIP permanente / vitalício</strong>.
                </p>
              )}
            </div>
          </div>

          {/* Limite de Usos e Validade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Limite de Usos (opcional)
              </label>
              <input
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Vazio = Ilimitado"
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-text focus:border-primary outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Data de Validade (opcional)
              </label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-text focus:border-primary outline-hidden"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border text-text-muted hover:text-text hover:bg-background text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={submitting || !code.trim()}
              className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Plus size={14} />
                  <span>Criar Cupom</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

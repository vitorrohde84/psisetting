"use client";

import { useState } from "react";
import { X, Tag, Plus, Loader2, Sparkles } from "lucide-react";

interface CouponModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CouponModal({ isOpen, onClose, onSuccess }: CouponModalProps) {
  const [code, setCode] = useState("");
  const [trialDays, setTrialDays] = useState(30);
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

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
          trial_days: Number(trialDays) || 30,
          max_uses: maxUses ? Number(maxUses) : null,
          expires_at: expiresAt || null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setCode("");
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
      <div className="relative w-full max-w-md bg-surface rounded-2xl shadow-2xl border border-border/80 p-6 space-y-5">
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
                Campanhas, parcerias ou extensões de teste
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
          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Código do Cupom *
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ex: HELLEN30, CRP-RS, VIP60"
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs font-mono font-bold text-text uppercase focus:border-primary focus:ring-1 focus:ring-primary outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Dias de Teste Grátis *
              </label>
              <input
                type="number"
                value={trialDays}
                onChange={(e) => setTrialDays(Number(e.target.value))}
                min={1}
                max={365}
                required
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-text focus:border-primary outline-hidden"
              />
            </div>

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

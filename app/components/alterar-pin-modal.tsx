"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { hashDiarioPin } from "@/utils/crypto";
import { X, KeyRound, Check, Loader2, AlertCircle } from "lucide-react";

interface AlterarPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AlterarPinModal({ isOpen, onClose, onSuccess }: AlterarPinModalProps) {
  const supabase = createClient();
  const [novoPin, setNovoPin] = useState("");
  const [confirmaPin, setConfirmaPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanNovo = novoPin.replace(/\D/g, "");
    const cleanConfirma = confirmaPin.replace(/\D/g, "");

    if (cleanNovo.length !== 6) {
      setError("O PIN deve conter exatamente 6 dígitos numéricos.");
      return;
    }

    if (cleanNovo !== cleanConfirma) {
      setError("A confirmação do PIN não coincide com o novo PIN.");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Sessão expirada. Faça login novamente.");
        setSaving(false);
        return;
      }

      const newHash = await hashDiarioPin(cleanNovo, user.id);

      // 1. Atualizar user_metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: { diario_pin_hash: newHash },
      });

      if (authError) {
        console.error("Erro ao atualizar PIN no auth:", authError);
        setError("Não foi possível atualizar o PIN. Tente novamente.");
        setSaving(false);
        return;
      }

      // 2. Atualizar profiles se coluna existir
      try {
        await supabase
          .from("profiles")
          .update({ diario_pin_hash: newHash })
          .eq("id", user.id);
      } catch {
        // Ignora caso a coluna não exista
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setNovoPin("");
        setConfirmaPin("");
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Erro inesperado:", err);
      setError("Erro inesperado ao salvar novo PIN.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-border flex items-center justify-between bg-surface-hover/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <KeyRound size={18} />
            </div>
            <div>
              <h3 className="text-base font-serif font-bold text-text">
                Alterar PIN do Diário
              </h3>
              <p className="text-[11px] text-text-muted">6 dígitos numéricos</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text hover:bg-surface-hover rounded-lg transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-2">
              <Check size={24} strokeWidth={3} />
            </div>
            <p className="text-sm font-semibold text-text">PIN atualizado com sucesso!</p>
            <p className="text-xs text-text-muted">Seu novo PIN já está ativo no Diário de Bordo.</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-5 space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-xs font-medium text-danger flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Novo PIN (6 números)
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={novoPin}
                onChange={(e) => setNovoPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Ex: 123456"
                required
                className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-center text-lg font-mono tracking-widest text-text focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Confirme o Novo PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={confirmaPin}
                onChange={(e) => setConfirmaPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Repita os 6 números"
                required
                className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-center text-lg font-mono tracking-widest text-text focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-3.5 py-2 rounded-xl text-xs text-text-muted hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || novoPin.length !== 6 || confirmaPin.length !== 6}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark active:scale-[0.98] transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <span>Salvar Novo PIN</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

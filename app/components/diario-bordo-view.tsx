"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Lock, Unlock, ShieldAlert, Loader2 } from "lucide-react";
import { DiarioList } from "./diario-list";

export function DiarioBordoView() {
  const supabase = createClient();
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email || null);
      }
      setLoadingAuth(false);
    }
    getUser();
  }, [supabase]);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;

    setUnlocking(true);
    setError(null);

    // SPEC.md: Exige reconfirmação de senha
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Senha incorreta. Tente novamente.");
      setUnlocking(false);
    } else {
      setUnlocked(true);
      setUnlocking(false);
      setPassword(""); // Clear password from memory
    }
  }

  if (loadingAuth) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="max-w-md mx-auto mt-12 bg-surface rounded-2xl border border-border/60 shadow-xl overflow-hidden">
        <div className="p-6 text-center border-b border-border/40 bg-background/50">
          <div className="w-12 h-12 bg-danger/10 text-danger rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock size={24} />
          </div>
          <h2 className="text-xl font-serif font-semibold text-text">Diário de Bordo</h2>
          <p className="text-sm text-text-muted mt-1">
            Área de altíssima sensibilidade. Reautenticação obrigatória.
          </p>
        </div>

        <form onSubmit={handleUnlock} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              Email
            </label>
            <input
              type="email"
              disabled
              value={email || ""}
              className="w-full px-3.5 py-2.5 rounded-xl bg-background/50 border border-border/50 text-text-muted text-sm cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              Senha <span className="text-danger">*</span>
            </label>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha de acesso"
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-text text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-danger/5 border border-danger/15 text-sm text-danger text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={unlocking}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl
                       bg-primary text-white text-sm font-medium
                       hover:bg-primary-dark active:scale-[0.98] disabled:opacity-70 transition-all duration-200 mt-2 cursor-pointer"
          >
            {unlocking ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Unlock size={16} />
            )}
            Desbloquear Acesso
          </button>
        </form>
      </div>
    );
  }

  // Se estiver desbloqueado, renderiza a lista/editor
  // Adiciona a classe global para travar seleção de texto e impressão via CSS
  return (
    <div className="print:hidden select-none" onContextMenu={(e) => e.preventDefault()}>
      {/* Banner de Segurança (SPEC.md) */}
      <div className="flex items-center gap-2 p-3 mb-6 rounded-xl bg-primary/10 border border-primary/20">
        <ShieldAlert size={18} className="text-primary shrink-0" />
        <p className="text-sm text-primary font-semibold">
          Conteúdo confidencial — uso exclusivo do profissional
        </p>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body { display: none !important; }
        }
      `}} />

      <DiarioList />
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  X,
  MessageCircle,
  Mail,
  Calendar,
  Users,
  Clock,
  ShieldCheck,
  Crown,
  Sparkles,
  Plus,
  Loader2,
  CheckCircle2,
  Phone,
  Building,
} from "lucide-react";

interface UserDetailDrawerProps {
  user: any | null;
  onClose: () => void;
  onAction: (userId: string, action: string, days?: number) => Promise<void>;
}

export function UserDetailDrawer({ user, onClose, onAction }: UserDetailDrawerProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  if (!user) return null;

  async function handleActionClick(action: string, days?: number) {
    setLoadingAction(`${action}_${days || ""}`);
    try {
      await onAction(user.id, action, days);
    } finally {
      setLoadingAction(null);
    }
  }

  const statusBadges: Record<string, { label: string; bg: string }> = {
    active: { label: "Assinante Ativo (R$ 34,90/mês)", bg: "bg-emerald-50 border-emerald-200 text-emerald-900" },
    trialing: { label: `Período de Testes (${user.trialDaysLeft} dias restantes)`, bg: "bg-blue-50 border-blue-200 text-blue-900" },
    expired: { label: "Teste Expirado (Modo Leitura)", bg: "bg-amber-50 border-amber-200 text-amber-900" },
    vip: { label: "Acesso VIP / Cortesia Vitalícia", bg: "bg-purple-50 border-purple-200 text-purple-900" },
    past_due: { label: "Pagamento Pendente / Atrasado", bg: "bg-rose-50 border-rose-200 text-rose-900" },
  };

  const currentBadge = statusBadges[user.calculatedStatus] || statusBadges.trialing;

  const rawPhone = (user.telefone || "").replace(/\D/g, "");
  const whatsappMsg = `Olá Dr(a). ${user.nome || ""}, tudo bem? Sou da equipe do PsiSetting! Vi que você começou seus testes no sistema e gostaria de saber se precisa de algum apoio inicial para configurar seus pacientes e laudos.`;
  const whatsappLink = rawPhone ? `https://wa.me/55${rawPhone}?text=${encodeURIComponent(whatsappMsg)}` : null;

  const initials = (user.nome || "P")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-stone-900/30 backdrop-blur-2xs transition-opacity animate-fadeIn"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="fixed top-0 right-0 z-[90] h-full w-full max-w-md bg-surface border-l border-border/80 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header da Gaveta */}
        <div className="p-5 border-b border-border/60 flex items-start justify-between gap-3 bg-background/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">
              {initials}
            </div>
            <div className="min-w-0">
              <h3 className="font-serif font-bold text-text text-base truncate">
                {user.nome || "Sem Nome Cadastrado"}
              </h3>
              <p className="text-xs text-text-muted truncate">{user.email}</p>
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

        {/* Conteúdo com Scroll */}
        <div className="flex-1 p-5 space-y-5 overflow-y-auto">
          {/* Status Badge Principal */}
          {user.is_admin || user.email === "vitorrohde84@gmail.com" ? (
            <div className="p-3 rounded-xl border border-primary/20 bg-primary/10 text-primary text-xs font-bold flex items-center justify-between">
              <span>Administrador & Desenvolvedor do SaaS</span>
              <ShieldCheck size={16} />
            </div>
          ) : (
            <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${currentBadge.bg}`}>
              <span>{currentBadge.label}</span>
              {user.is_vip && <Crown size={14} className="text-purple-700" />}
            </div>
          )}

          {/* Dados de Contato Direto */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Canais de Contato
            </p>

            <div className="space-y-1.5 text-xs">
              {whatsappLink ? (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all flex items-center justify-center gap-2 shadow-2xs"
                >
                  <MessageCircle size={15} />
                  <span>Conversar no WhatsApp ({user.telefone})</span>
                </a>
              ) : (
                <div className="p-2.5 rounded-xl bg-background border border-border/80 text-text-muted flex items-center gap-2 text-xs">
                  <Phone size={14} />
                  <span>Telefone / WhatsApp não informado</span>
                </div>
              )}

              <a
                href={`mailto:${user.email}?subject=${encodeURIComponent("PsiSetting - Apoio e Atendimento")}`}
                className="w-full py-2 px-3 rounded-xl bg-surface hover:bg-background border border-border text-text font-semibold transition-all flex items-center justify-center gap-2"
              >
                <Mail size={14} className="text-primary" />
                <span>Enviar E-mail Direto</span>
              </a>
            </div>
          </div>

          {/* Dados Cadastrais & Uso da Ferramenta */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Informações do Consultório
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-background border border-border/80 space-y-0.5">
                <p className="text-text-muted text-[10.5px]">Pacientes Cadastrados</p>
                <p className="font-serif font-bold text-base text-text">{user.totalPatients || 0}</p>
              </div>

              <div className="p-3 rounded-xl bg-background border border-border/80 space-y-0.5">
                <p className="text-text-muted text-[10.5px]">Registro no CRP</p>
                <p className="font-bold text-text truncate">{user.crp || "Pendente"}</p>
              </div>

              <div className="p-3 rounded-xl bg-background border border-border/80 space-y-0.5">
                <p className="text-text-muted text-[10.5px]">Data de Cadastro</p>
                <p className="font-semibold text-text">
                  {user.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR") : "—"}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-background border border-border/80 space-y-0.5">
                <p className="text-text-muted text-[10.5px]">Vencimento do Teste</p>
                <p className="font-semibold text-text">
                  {user.trial_ends_at ? new Date(user.trial_ends_at).toLocaleDateString("pt-BR") : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Ações Administrativas de 1 Clique */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Ações Rápidas na Conta
            </p>

            {/* Estender Período de Testes */}
            <div className="p-3 rounded-xl bg-background border border-border/80 space-y-2">
              <p className="text-xs font-semibold text-text flex items-center gap-1.5">
                <Clock size={13} className="text-primary" />
                <span>Estender Dias de Teste Grátis</span>
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {[7, 15, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    disabled={loadingAction === `extend_trial_${days}`}
                    onClick={() => handleActionClick("extend_trial", days)}
                    className="py-1.5 px-2 rounded-lg bg-surface hover:bg-primary hover:text-white border border-border text-xs font-semibold text-text transition-all cursor-pointer disabled:opacity-50"
                  >
                    {loadingAction === `extend_trial_${days}` ? (
                      <Loader2 size={12} className="animate-spin mx-auto" />
                    ) : (
                      `+${days} dias`
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Acesso VIP / Cortesia */}
            <div className="p-3 rounded-xl bg-background border border-border/80 space-y-2">
              <p className="text-xs font-semibold text-text flex items-center gap-1.5">
                <Crown size={13} className="text-purple-700" />
                <span>Status VIP / Cortesia Vitalícia</span>
              </p>
              {user.is_vip ? (
                <button
                  type="button"
                  disabled={loadingAction === "revoke_vip_"}
                  onClick={() => handleActionClick("revoke_vip")}
                  className="w-full py-2 px-3 rounded-xl bg-surface hover:bg-rose-50 border border-border text-rose-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loadingAction === "revoke_vip_" ? <Loader2 size={13} className="animate-spin mx-auto" /> : "Revogar Status VIP"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={loadingAction === "grant_vip_"}
                  onClick={() => handleActionClick("grant_vip")}
                  className="w-full py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loadingAction === "grant_vip_" ? <Loader2 size={13} className="animate-spin mx-auto" /> : "Conceder Acesso VIP Vitalício 👑"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

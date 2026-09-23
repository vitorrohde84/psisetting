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
  Trash2,
  AlertTriangle,
  RotateCcw,
  Tag,
} from "lucide-react";
import { linkWhatsApp } from "@/utils/whatsapp";
import { PRECO_BASE, descreverDesconto, formatarReais } from "@/utils/preco-desconto";

/**
 * Datas da assinatura no fuso de Brasília. O fim do período pago é um instante
 * (ex.: 02h UTC), e no fuso do navegador de quem está fora do Brasil ele cairia
 * no dia anterior.
 */
function formatarData(iso: string | null | undefined, curta = false): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(
    "pt-BR",
    curta
      ? { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }
      : { timeZone: "America/Sao_Paulo" }
  );
}

interface UserDetailDrawerProps {
  user: any | null;
  onClose: () => void;
  onAction: (userId: string, action: string, days?: number) => Promise<void>;
}

export function UserDetailDrawer({ user, onClose, onAction }: UserDetailDrawerProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [customDays, setCustomDays] = useState<string>("7");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!user) return null;

  const isPrimaryAdmin = user.is_admin || user.email === "vitorrohde84@gmail.com";

  async function handleActionClick(action: string, days?: number) {
    setLoadingAction(`${action}_${days || ""}`);
    try {
      await onAction(user.id, action, days);
      if (action === "delete_user") {
        onClose();
      }
    } finally {
      setLoadingAction(null);
      setShowDeleteConfirm(false);
    }
  }

  const pagoAte = formatarData(user.current_period_end);
  const pagoAteCurto = formatarData(user.current_period_end, true);
  const ultimoPagamento = formatarData(user.ultimoPagamentoEm);
  const cupom = user.cupomEmUso;
  const diasParaVencer: number | null = user.diasParaVencer ?? null;
  // Os dias que faltam contam até o fim do ACESSO (o maior entre pago e teste
  // por cupom), que pode ser depois do "Pago até". Mostrados com a data certa.
  const acessoAteCurto = formatarData(user.acessoAte ?? user.current_period_end, true);

  // Sem preço no selo: com cupom, o valor muda de pessoa para pessoa (fica na
  // seção Assinatura).
  const statusBadges: Record<string, { label: string; bg: string }> = {
    active: {
      label: pagoAteCurto ? `Assinante ativo · pago até ${pagoAteCurto}` : "Assinante ativo",
      bg: "bg-emerald-50 border-emerald-200 text-emerald-900",
    },
    trialing: { label: `Período de Testes (${user.trialDaysLeft} dias restantes)`, bg: "bg-blue-50 border-blue-200 text-blue-900" },
    // Inclui quem pagou e deixou vencer, não só quem saiu do teste.
    expired: { label: "Acesso vencido (Modo Leitura)", bg: "bg-amber-50 border-amber-200 text-amber-900" },
    vip: { label: "Acesso VIP / Cortesia Vitalícia", bg: "bg-purple-50 border-purple-200 text-purple-900" },
    past_due: { label: "Pagamento Pendente / Atrasado", bg: "bg-rose-50 border-rose-200 text-rose-900" },
  };

  const currentBadge = statusBadges[user.calculatedStatus] || statusBadges.trialing;

  const whatsappMsg = `Olá Psi. ${user.nome || ""}, tudo bem? Sou da equipe do PsiSetting! Vi que você começou seus testes no sistema e gostaria de saber se precisa de algum apoio inicial para configurar seus pacientes e laudos.`;
  // Antes o 55 era prefixado sempre: telefone cadastrado com +55 virava 5555… e o link não abria.
  const whatsappLink = linkWhatsApp(user.telefone, whatsappMsg);

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
          {isPrimaryAdmin ? (
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

          {/* Assinatura: até quando está pago, por onde pagou e quanto paga */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Assinatura
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-background border border-border/80 space-y-0.5">
                <p className="text-text-muted text-[10.5px]">Pago até</p>
                <p className="font-semibold text-text">{pagoAte ?? "Nenhum período pago"}</p>
                {pagoAte && user.calculatedStatus === "active" && diasParaVencer !== null && (
                  <p className="text-[10.5px] text-text-muted">
                    {diasParaVencer === 1 ? "falta 1 dia" : `faltam ${diasParaVencer} dias`} de acesso
                    {acessoAteCurto && acessoAteCurto !== pagoAteCurto ? ` (até ${acessoAteCurto}, com dias de teste por cupom)` : ""}
                  </p>
                )}
                {pagoAte && user.calculatedStatus === "expired" && (
                  <p className="text-[10.5px] text-amber-800 font-semibold">vencido</p>
                )}
              </div>

              <div className="p-3 rounded-xl bg-background border border-border/80 space-y-0.5">
                <p className="text-text-muted text-[10.5px]">Último pagamento</p>
                <p className="font-semibold text-text">{ultimoPagamento ?? "Nenhum registrado"}</p>
                {ultimoPagamento && user.ultimoMeio && (
                  <p className="text-[10.5px] text-text-muted">
                    {user.ultimoMeio === "pix" ? "por PIX" : "no cartão"}
                  </p>
                )}
              </div>

              <div className="col-span-2 p-3 rounded-xl bg-background border border-border/80 space-y-1">
                <p className="text-text-muted text-[10.5px]">Cupom em uso</p>
                {cupom ? (
                  <>
                    <p className="font-semibold text-text flex items-center gap-1.5 flex-wrap">
                      <Tag size={12} className="text-primary" />
                      <span className="font-mono font-bold">{cupom.codigo}</span>
                      <span className="text-text-muted font-normal">·</span>
                      <span>{descreverDesconto(cupom.tipo, cupom.valor)}</span>
                    </p>
                    <p className="text-[11px] text-text-muted leading-relaxed">
                      Paga <strong className="text-emerald-800">R$ {formatarReais(cupom.valorFinal)}/mês</strong>
                      {cupom.paraSempre || cupom.restantes === null ? (
                        <> · para sempre</>
                      ) : (
                        <>
                          {" "}
                          · mais {cupom.restantes}{" "}
                          {cupom.restantes === 1 ? "mensalidade" : "mensalidades"} com desconto, depois R${" "}
                          {formatarReais(PRECO_BASE)}/mês
                        </>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="font-semibold text-text">
                    {user.calculatedStatus === "vip"
                      ? "Não se aplica (VIP)"
                      : `Nenhum — preço cheio (R$ ${formatarReais(PRECO_BASE)}/mês)`}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Ações Administrativas de 1 Clique */}
          <div className="space-y-3 pt-2 border-t border-border/60">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Gerenciamento de Acesso & Testes
            </p>

            {/* Gestão Flexível de Período de Testes */}
            <div className="p-3.5 rounded-xl bg-background border border-border/80 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-text flex items-center gap-1.5">
                  <Clock size={13} className="text-primary" />
                  <span>Dias de Teste Grátis</span>
                </p>
                <span className="text-[10px] text-text-muted">
                  {user.trialDaysLeft > 0 ? `${user.trialDaysLeft} dias restantes` : "Expirado"}
                </span>
              </div>

              {/* Botões Rápidos de Aumento */}
              <div className="grid grid-cols-3 gap-1.5">
                {[7, 15, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    disabled={loadingAction === `extend_trial_${days}`}
                    onClick={() => handleActionClick("extend_trial", days)}
                    className="py-1.5 px-2 rounded-lg bg-surface hover:bg-primary hover:text-white border border-border text-xs font-semibold text-text transition-all cursor-pointer disabled:opacity-50 text-center"
                  >
                    {loadingAction === `extend_trial_${days}` ? (
                      <Loader2 size={12} className="animate-spin mx-auto" />
                    ) : (
                      `+${days} dias`
                    )}
                  </button>
                ))}
              </div>

              {/* Definir Exatamente X dias */}
              <div className="pt-1.5 border-t border-border/60 flex items-center gap-2">
                <div className="flex-1 flex items-center bg-surface rounded-lg border border-border px-2.5 py-1">
                  <span className="text-[11px] text-text-muted mr-1.5 whitespace-nowrap">Definir exatos:</span>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    className="w-full bg-transparent text-xs font-bold text-text focus:outline-none"
                    placeholder="7"
                  />
                  <span className="text-[11px] text-text-muted ml-1">dias</span>
                </div>
                <button
                  type="button"
                  disabled={loadingAction === `set_trial_days_${customDays}` || !customDays}
                  onClick={() => handleActionClick("set_trial_days", Number(customDays))}
                  className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {loadingAction === `set_trial_days_${customDays}` ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    "Definir"
                  )}
                </button>
              </div>

              {/* Botão de Zerar / Expirar Acesso Grátis */}
              <button
                type="button"
                disabled={loadingAction === "expire_trial_"}
                onClick={() => {
                  if (confirm(`Deseja zerar os dias de teste e expirar o acesso de ${user.nome || user.email}?`)) {
                    handleActionClick("expire_trial");
                  }
                }}
                className="w-full py-1.5 px-2 rounded-lg bg-amber-50/80 hover:bg-amber-100 border border-amber-200/80 text-amber-900 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RotateCcw size={12} className="text-amber-700" />
                <span>Zerar / Encerrar Teste Imediatamente</span>
              </button>
            </div>

            {/* Acesso VIP / Cortesia */}
            <div className="p-3.5 rounded-xl bg-background border border-border/80 space-y-2">
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

            {/* Zona de Perigo: Exclusão de Conta */}
            {!isPrimaryAdmin && (
              <div className="p-3.5 rounded-xl bg-rose-50/50 border border-rose-200/80 space-y-2.5">
                <div className="flex items-center gap-1.5 text-rose-800 text-xs font-bold">
                  <AlertTriangle size={13} className="text-rose-600" />
                  <span>Zona de Perigo</span>
                </div>
                <p className="text-[11px] text-rose-900/80 leading-relaxed">
                  Exclui permanentemente o psicólogo, prontuários, registros e libera o e-mail no Supabase para novos testes.
                </p>

                {showDeleteConfirm ? (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] font-bold text-rose-950 text-center">
                      Confirmar exclusão definitiva?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={loadingAction === "delete_user_"}
                        onClick={() => handleActionClick("delete_user")}
                        className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                      >
                        {loadingAction === "delete_user_" ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <>
                            <Trash2 size={13} />
                            <span>Sim, Excluir</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="py-2 px-3 rounded-xl bg-surface border border-border text-text text-xs font-semibold hover:bg-background transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-2 px-3 rounded-xl bg-surface hover:bg-rose-100/70 border border-rose-200 text-rose-700 hover:text-rose-800 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Excluir Conta do Usuário</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

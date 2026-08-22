"use client";

import { useState } from "react";
import {
  Lightbulb,
  Bug,
  HelpCircle,
  Heart,
  Star,
  Send,
  CheckCircle2,
  Clock,
  Archive,
  Mail,
  User,
  Calendar,
  Filter,
} from "lucide-react";

interface FeedbackInboxViewProps {
  feedbacks: any[];
  onUpdateStatus: (id: string, status: string, admin_notes?: string) => Promise<void>;
}

export function FeedbackInboxView({ feedbacks, onUpdateStatus }: FeedbackInboxViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    feedbacks.length > 0 ? feedbacks[0].id : null
  );
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const categoryLabels: Record<string, { label: string; bg: string; icon: any }> = {
    sugestao: { label: "Sugestão", bg: "bg-amber-50 text-amber-900 border-amber-200", icon: Lightbulb },
    problema: { label: "Problema / Bug", bg: "bg-rose-50 text-rose-900 border-rose-200", icon: Bug },
    duvida: { label: "Dúvida", bg: "bg-blue-50 text-blue-900 border-blue-200", icon: HelpCircle },
    elogio: { label: "Elogio", bg: "bg-emerald-50 text-emerald-900 border-emerald-200", icon: Heart },
  };

  const statusLabels: Record<string, { label: string; bg: string; text: string }> = {
    pending: { label: "Pendente", bg: "bg-amber-100", text: "text-amber-900" },
    in_review: { label: "Em Análise", bg: "bg-blue-100", text: "text-blue-900" },
    planned: { label: "Planejado", bg: "bg-purple-100", text: "text-purple-900" },
    resolved: { label: "Implementado", bg: "bg-emerald-100", text: "text-emerald-900" },
    archived: { label: "Arquivado", bg: "bg-stone-200", text: "text-stone-700" },
  };

  const filteredFeedbacks = feedbacks.filter((f) => {
    if (categoryFilter !== "all" && f.category !== categoryFilter) return false;
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    return true;
  });

  const activeFeedback = feedbacks.find((f) => f.id === selectedId) || (filteredFeedbacks.length > 0 ? filteredFeedbacks[0] : null);

  return (
    <div className="bg-surface rounded-2xl border border-border/80 shadow-xs overflow-hidden flex flex-col lg:flex-row h-[calc(100vh-180px)] min-h-[550px] animate-fadeIn">
      {/* ───────── COLUNA ESQUERDA: LISTA DE MENSAGENS ───────── */}
      <div className="w-full lg:w-80 lg:border-r border-border/60 flex flex-col shrink-0 bg-background/30">
        {/* Filtros da Caixa de Entrada */}
        <div className="p-3.5 border-b border-border/40 space-y-2 bg-surface">
          <div className="flex items-center justify-between">
            <h3 className="font-serif font-bold text-text text-xs flex items-center gap-1.5">
              <Lightbulb size={14} className="text-primary" />
              Feedbacks ({filteredFeedbacks.length})
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-[11px] font-semibold text-text outline-hidden"
            >
              <option value="all">Categorias (Todas)</option>
              <option value="sugestao">💡 Sugestões</option>
              <option value="problema">🐛 Problemas</option>
              <option value="duvida">💬 Dúvidas</option>
              <option value="elogio">❤️ Elogios</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-[11px] font-semibold text-text outline-hidden"
            >
              <option value="all">Status (Todos)</option>
              <option value="pending">🟡 Pendente</option>
              <option value="in_review">🔵 Em Análise</option>
              <option value="planned">🟣 Planejado</option>
              <option value="resolved">🟢 Concluído</option>
            </select>
          </div>
        </div>

        {/* Feed de Mensagens */}
        <div className="flex-1 overflow-y-auto divide-y divide-border/40">
          {filteredFeedbacks.length === 0 ? (
            <div className="p-8 text-center text-xs text-text-muted space-y-1">
              <Heart size={20} className="mx-auto text-primary/40 mb-1" />
              <p>Nenhuma mensagem nesta categoria.</p>
            </div>
          ) : (
            filteredFeedbacks.map((f) => {
              const isSelected = activeFeedback?.id === f.id;
              const cat = categoryLabels[f.category] || categoryLabels.sugestao;
              const status = statusLabels[f.status] || statusLabels.pending;
              const Icon = cat.icon;

              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedId(f.id)}
                  className={`w-full p-3.5 text-left transition-all cursor-pointer flex flex-col gap-1.5 ${
                    isSelected
                      ? "bg-surface shadow-2xs border-l-4 border-primary"
                      : "hover:bg-surface/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${cat.bg}`}>
                      <Icon size={11} />
                      <span>{cat.label}</span>
                    </span>

                    <span className="text-[10px] text-text-muted">
                      {f.created_at ? new Date(f.created_at).toLocaleDateString("pt-BR") : ""}
                    </span>
                  </div>

                  <p className="font-bold text-xs text-text truncate">
                    {f.subject || f.user_name || "Sem Assunto"}
                  </p>

                  <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed">
                    {f.message}
                  </p>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-text-muted truncate max-w-[140px]">
                      {f.user_name || f.user_email}
                    </span>

                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${status.bg} ${status.text}`}>
                      {status.label}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ───────── COLUNA DIREITA: LEITOR DA MENSAGEM ───────── */}
      <div className="flex-1 flex flex-col overflow-y-auto bg-surface">
        {activeFeedback ? (
          <div className="p-6 space-y-6 flex-1 flex flex-col">
            {/* Header do Feedback */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-serif font-bold text-base text-text">
                    {activeFeedback.subject || "Sugestão / Feedback"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <User size={13} className="text-primary" />
                  <span className="font-semibold text-text">{activeFeedback.user_name || "Psicólogo(a)"}</span>
                  <span>·</span>
                  <Mail size={13} />
                  <span>{activeFeedback.user_email}</span>
                </div>
              </div>

              {/* Status Selector & Data */}
              <div className="flex items-center gap-2">
                <select
                  value={activeFeedback.status}
                  onChange={(e) => onUpdateStatus(activeFeedback.id, e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-background border border-border text-xs font-bold text-text outline-hidden"
                >
                  <option value="pending">🟡 Pendente</option>
                  <option value="in_review">🔵 Em Análise</option>
                  <option value="planned">🟣 Planejado / Na Fila</option>
                  <option value="resolved">🟢 Implementado / Concluído</option>
                  <option value="archived">⚪ Arquivar</option>
                </select>
              </div>
            </div>

            {/* Avaliação em Estrelas se houver */}
            {activeFeedback.rating && (
              <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-200/60 flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-950">Avaliação da Experiência:</span>
                <div className="flex items-center gap-1 text-amber-400">
                  {Array.from({ length: activeFeedback.rating }).map((_, i) => (
                    <Star key={i} size={14} className="fill-amber-400" />
                  ))}
                  <span className="text-xs font-bold text-amber-900 ml-1">
                    {activeFeedback.rating} de 5 estrelas
                  </span>
                </div>
              </div>
            )}

            {/* Corpo da Mensagem */}
            <div className="flex-1 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Mensagem do Psicólogo
              </p>
              <div className="p-4 rounded-2xl bg-background/50 border border-border/80 text-xs sm:text-sm text-text leading-relaxed whitespace-pre-wrap font-sans">
                {activeFeedback.message}
              </div>
            </div>

            {/* Ações Rápidas (Responder por E-mail) */}
            <div className="pt-4 border-t border-border/40 flex items-center justify-between gap-3">
              <p className="text-xs text-text-muted">
                Recebido em {activeFeedback.created_at ? new Date(activeFeedback.created_at).toLocaleDateString("pt-BR") : ""}
              </p>

              <a
                href={`mailto:${activeFeedback.user_email}?subject=${encodeURIComponent(
                  `PsiSetting - Resposta: ${activeFeedback.subject || "Seu Feedback"}`
                )}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-all shadow-2xs"
              >
                <Send size={13} />
                <span>Responder por E-mail</span>
              </a>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted space-y-2">
            <Lightbulb size={32} className="text-primary/30" />
            <p className="text-xs">Selecione uma mensagem à esquerda para ler os detalhes.</p>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Calendar,
  List,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Video,
  MapPin,
  Pencil,
  Trash2,
  Smartphone,
  Copy,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { AgendamentoFormModal } from "./agendamento-form-modal";

export interface Agendamento {
  id: string;
  paciente_id: string;
  data: string;
  horario: string;
  duracao_minutos: number | null;
  modalidade: string | null;
  status: string;
  observacoes: string | null;
  psicologo_id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pacientes?: any;
}

function getPacienteName(ag: Agendamento): string {
  const p = ag.pacientes;
  if (!p) return "Paciente";
  if (Array.isArray(p)) return p[0]?.nome || "Paciente";
  return p.nome || "Paciente";
}

const STATUS_MAP: Record<string, { label: string; class: string }> = {
  agendado: { label: "Agendado", class: "bg-secondary/10 text-secondary" },
  confirmado: { label: "Confirmado", class: "bg-success/10 text-success" },
  realizado: { label: "Realizado", class: "bg-primary/10 text-primary" },
  cancelado: { label: "Cancelado", class: "bg-danger/10 text-danger" },
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatTime(t: string) {
  return t.slice(0, 5);
}

export function AgendaView() {
  const supabase = createClient();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingAg, setEditingAg] = useState<Agendamento | null>(null);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [showIcsInfo, setShowIcsInfo] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Compute month boundaries for query
  const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0);
  const lastDayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  const fetchAgendamentos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("agendamentos")
      .select("id, paciente_id, data, horario, duracao_minutos, modalidade, status, observacoes, psicologo_id, pacientes(nome)")
      .gte("data", firstDay)
      .lte("data", lastDayStr)
      .order("data", { ascending: true })
      .order("horario", { ascending: true });

    setAgendamentos(data || []);
    setLoading(false);
  }, [firstDay, lastDayStr]);

  useEffect(() => {
    fetchAgendamentos();
  }, [fetchAgendamentos]);

  // Today string
  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  // Group agendamentos by date
  const byDate = useMemo(() => {
    const map: Record<string, Agendamento[]> = {};
    agendamentos.forEach((ag) => {
      if (!map[ag.data]) map[ag.data] = [];
      map[ag.data].push(ag);
    });
    return map;
  }, [agendamentos]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const startDay = firstDayOfMonth.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: { day: number | null; dateStr: string }[] = [];
    // Empty slots before first day
    for (let i = 0; i < startDay; i++) {
      days.push({ day: null, dateStr: "" });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ day: d, dateStr });
    }
    return days;
  }, [year, month]);

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDate(null);
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDate(null);
  }

  function goToToday() {
    setCurrentDate(new Date());
    setSelectedDate(todayStr);
  }

  function handleDayClick(dateStr: string) {
    setSelectedDate(selectedDate === dateStr ? null : dateStr);
  }

  function handleNewOnDate(dateStr: string) {
    setPrefillDate(dateStr);
    setEditingAg(null);
    setShowModal(true);
  }

  function handleNew() {
    setPrefillDate(null);
    setEditingAg(null);
    setShowModal(true);
  }

  function handleEdit(ag: Agendamento) {
    setEditingAg(ag);
    setPrefillDate(null);
    setShowModal(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja cancelar este agendamento?")) return;
    setDeleting(id);
    await supabase.from("agendamentos").update({ status: "cancelado" }).eq("id", id);
    await fetchAgendamentos();
    setDeleting(null);
  }

  function handleModalClose() {
    setShowModal(false);
    setEditingAg(null);
    setPrefillDate(null);
  }

  async function handleSaved() {
    handleModalClose();
    await fetchAgendamentos();
  }

  // iCal URL
  const calToken = typeof window !== "undefined"
    ? ""
    : "";

  function getWebcalUrl() {
    if (typeof window === "undefined") return "";
    const host = window.location.host;
    const protocol = window.location.protocol === "https:" ? "webcal" : "http";
    return `${protocol}://${host}/calendario/${process.env.NEXT_PUBLIC_CALENDAR_TOKEN || "TOKEN"}`;
  }

  async function copyCalUrl() {
    const url = getWebcalUrl().replace("webcal://", "https://");
    await navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  // Selected date agendamentos
  const selectedAgs = selectedDate ? byDate[selectedDate] || [] : [];

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-serif font-semibold text-text">Agenda</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Gerencie seus agendamentos e sessões
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowIcsInfo(!showIcsInfo)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl
                       bg-background border border-border text-sm font-medium text-text-muted
                       hover:border-primary/30 hover:text-text transition-all cursor-pointer"
            title="Assinar no iPhone"
          >
            <Smartphone size={16} />
            <span className="hidden sm:inline">iPhone</span>
          </button>
          <button
            onClick={handleNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl
                       bg-primary text-white text-sm font-medium
                       hover:bg-primary-dark active:scale-[0.98]
                       transition-all duration-200 cursor-pointer"
          >
            <Plus size={18} />
            Novo Agendamento
          </button>
        </div>
      </div>

      {/* iPhone subscription card */}
      {showIcsInfo && (
        <div className="bg-surface rounded-xl border border-border/60 p-5 mb-6">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <Smartphone size={18} className="text-primary" />
              <h3 className="text-base font-serif font-medium text-text">
                Assinar no iPhone
              </h3>
            </div>
            <button
              onClick={() => setShowIcsInfo(false)}
              className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-background transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3 text-sm text-text-muted">
            <p>
              Para ver seus agendamentos no app <strong className="text-text">Calendário do iPhone</strong>, siga os passos:
            </p>
            <ol className="list-decimal list-inside space-y-1.5 pl-1">
              <li>Abra <strong className="text-text">Ajustes</strong> no iPhone</li>
              <li>Vá em <strong className="text-text">Calendário → Contas → Adicionar Conta → Outra</strong></li>
              <li>Toque em <strong className="text-text">Adicionar Calendário Assinado</strong></li>
              <li>Cole a URL abaixo e confirme</li>
            </ol>

            <div className="flex items-center gap-2 p-3 bg-background rounded-xl border border-border mt-2">
              <code className="flex-1 text-xs text-text break-all font-mono">
                {typeof window !== "undefined"
                  ? `${window.location.protocol}//${window.location.host}/calendario/${process.env.NEXT_PUBLIC_CALENDAR_TOKEN || "SEU_TOKEN"}`
                  : "/calendario/SEU_TOKEN"}
              </code>
              <button
                onClick={copyCalUrl}
                className="shrink-0 p-2 rounded-lg hover:bg-surface transition-colors cursor-pointer"
                title="Copiar URL"
              >
                {copiedUrl ? (
                  <Check size={16} className="text-success" />
                ) : (
                  <Copy size={16} className="text-text-muted" />
                )}
              </button>
            </div>

            <p className="text-xs text-text-muted/70 mt-2">
              O calendário atualiza automaticamente. O intervalo é controlado pela Apple e pode levar algumas horas.
            </p>
          </div>
        </div>
      )}

      {/* View toggle + Month navigation */}
      <div className="flex items-center justify-between mb-4">
        {/* Month nav */}
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-surface border border-transparent hover:border-border transition-all cursor-pointer"
          >
            <ChevronLeft size={18} className="text-text-muted" />
          </button>
          <h3 className="text-base font-medium text-text min-w-[160px] text-center">
            {MONTHS[month]} {year}
          </h3>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg hover:bg-surface border border-transparent hover:border-border transition-all cursor-pointer"
          >
            <ChevronRight size={18} className="text-text-muted" />
          </button>
          <button
            onClick={goToToday}
            className="ml-1 px-2.5 py-1 rounded-lg text-xs font-medium text-primary bg-primary/8
                       hover:bg-primary/15 transition-colors cursor-pointer"
          >
            Hoje
          </button>
        </div>

        {/* View toggle */}
        <div className="flex bg-surface border border-border rounded-xl p-0.5">
          <button
            onClick={() => setView("calendar")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              view === "calendar"
                ? "bg-primary text-white"
                : "text-text-muted hover:text-text"
            }`}
          >
            <Calendar size={14} />
            Calendário
          </button>
          <button
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              view === "list"
                ? "bg-primary text-white"
                : "text-text-muted hover:text-text"
            }`}
          >
            <List size={14} />
            Lista
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : view === "calendar" ? (
        /* ======== CALENDAR VIEW ======== */
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Calendar grid */}
          <div className="bg-surface rounded-xl border border-border/60 overflow-hidden">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 bg-background/60 border-b border-border/40">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="py-2 text-center text-[11px] font-semibold text-text-muted uppercase tracking-wider"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {calendarDays.map((cell, i) => {
                if (cell.day === null) {
                  return <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-border/20 bg-background/20" />;
                }

                const dayAgs = byDate[cell.dateStr] || [];
                const isToday = cell.dateStr === todayStr;
                const isSelected = cell.dateStr === selectedDate;
                const hasAgs = dayAgs.length > 0;

                return (
                  <button
                    key={cell.dateStr}
                    onClick={() => handleDayClick(cell.dateStr)}
                    className={`relative min-h-[80px] p-1.5 border-b border-r border-border/20
                               text-left transition-colors cursor-pointer
                               ${isSelected ? "bg-primary/5 ring-1 ring-primary/30" : "hover:bg-background/60"}
                               ${isToday ? "bg-primary/[0.03]" : ""}`}
                  >
                    {/* Day number */}
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium
                        ${isToday ? "bg-primary text-white" : "text-text"}`}
                    >
                      {cell.day}
                    </span>

                    {/* Appointment dots */}
                    {hasAgs && (
                      <div className="mt-1 space-y-0.5">
                        {dayAgs.slice(0, 3).map((ag) => {
                          const statusInfo = STATUS_MAP[ag.status] || STATUS_MAP.agendado;
                          return (
                            <div
                              key={ag.id}
                              className={`text-[10px] font-medium truncate px-1 py-0.5 rounded ${statusInfo.class}`}
                            >
                              {formatTime(ag.horario)}{" "}
                              {getPacienteName(ag).split(" ")[0]}
                            </div>
                          );
                        })}
                        {dayAgs.length > 3 && (
                          <span className="text-[10px] text-text-muted px-1">
                            +{dayAgs.length - 3} mais
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected day panel */}
          <div className="bg-surface rounded-xl border border-border/60 h-fit">
            <div className="flex items-center justify-between p-4 border-b border-border/40">
              <h4 className="text-sm font-medium text-text">
                {selectedDate
                  ? new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })
                  : "Selecione um dia"}
              </h4>
              {selectedDate && (
                <button
                  onClick={() => handleNewOnDate(selectedDate)}
                  className="p-1.5 rounded-lg text-primary hover:bg-primary/8 transition-colors cursor-pointer"
                  title="Novo agendamento neste dia"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>

            <div className="p-3">
              {!selectedDate ? (
                <p className="text-sm text-text-muted text-center py-8">
                  Clique em um dia do calendário para ver os agendamentos
                </p>
              ) : selectedAgs.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar size={24} className="text-border mx-auto mb-2" />
                  <p className="text-sm text-text-muted mb-2">Nenhum agendamento</p>
                  <button
                    onClick={() => handleNewOnDate(selectedDate)}
                    className="text-xs text-primary hover:text-primary-dark font-medium transition-colors cursor-pointer"
                  >
                    Criar agendamento
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedAgs.map((ag) => (
                    <AgendamentoCard
                      key={ag.id}
                      ag={ag}
                      onEdit={() => handleEdit(ag)}
                      onDelete={() => handleDelete(ag.id)}
                      isDeleting={deleting === ag.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ======== LIST VIEW ======== */
        <div className="bg-surface rounded-xl border border-border/60">
          {agendamentos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Calendar size={32} className="text-border mb-3" />
              <p className="text-sm text-text-muted">Nenhum agendamento neste mês</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {Object.entries(byDate)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, dayAgs]) => (
                  <div key={date}>
                    {/* Date header */}
                    <div className="flex items-center justify-between px-5 py-2.5 bg-background/40 border-b border-border/20">
                      <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                        {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </span>
                      {date === todayStr && (
                        <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase">
                          Hoje
                        </span>
                      )}
                    </div>

                    {/* Appointments */}
                    {dayAgs.map((ag) => {
                      const pacNome = getPacienteName(ag);
                      const statusInfo = STATUS_MAP[ag.status] || STATUS_MAP.agendado;

                      return (
                        <div
                          key={ag.id}
                          className="flex items-center gap-4 px-5 py-3 hover:bg-background/40 transition-colors"
                        >
                          {/* Time */}
                          <div className="shrink-0 w-14 text-center">
                            <span className="text-sm font-semibold text-text">
                              {formatTime(ag.horario)}
                            </span>
                            {ag.duracao_minutos && (
                              <p className="text-[10px] text-text-muted">{ag.duracao_minutos}min</p>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text truncate">{pacNome}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {ag.modalidade && (
                                <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                                  {ag.modalidade === "online" ? <Video size={11} /> : <MapPin size={11} />}
                                  {ag.modalidade === "online" ? "Online" : "Presencial"}
                                </span>
                              )}
                              {ag.observacoes && (
                                <span className="text-xs text-text-muted truncate max-w-[150px]">{ag.observacoes}</span>
                              )}
                            </div>
                          </div>

                          {/* Status + Actions */}
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${statusInfo.class}`}>
                            {statusInfo.label}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleEdit(ag)}
                              className="p-1.5 rounded-lg text-text-muted/50 hover:text-text-muted hover:bg-background transition-colors cursor-pointer"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(ag.id)}
                              disabled={deleting === ag.id}
                              className="p-1.5 rounded-lg text-text-muted/50 hover:text-danger hover:bg-danger/5 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {deleting === ag.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <AgendamentoFormModal
          agendamento={editingAg}
          prefillDate={prefillDate}
          onClose={handleModalClose}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

/* ─── Small appointment card for the side panel ─── */
function AgendamentoCard({
  ag,
  onEdit,
  onDelete,
  isDeleting,
}: {
  ag: Agendamento;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const pacNome = getPacienteName(ag);
  const statusInfo = STATUS_MAP[ag.status] || STATUS_MAP.agendado;

  return (
    <div className="p-3 rounded-xl bg-background/60 border border-border/30">
      <div className="flex items-start justify-between mb-1.5">
        <div>
          <p className="text-sm font-medium text-text">{pacNome}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="inline-flex items-center gap-1 text-xs text-text-muted">
              <Clock size={11} />
              {formatTime(ag.horario)}
              {ag.duracao_minutos ? ` (${ag.duracao_minutos}min)` : ""}
            </span>
            {ag.modalidade && (
              <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                {ag.modalidade === "online" ? <Video size={11} /> : <MapPin size={11} />}
                {ag.modalidade === "online" ? "Online" : "Presencial"}
              </span>
            )}
          </div>
        </div>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusInfo.class}`}>
          {statusInfo.label}
        </span>
      </div>
      {ag.observacoes && (
        <p className="text-xs text-text-muted mt-1 line-clamp-2">{ag.observacoes}</p>
      )}
      <div className="flex items-center gap-1 mt-2">
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-text-muted
                     hover:bg-surface hover:text-text transition-colors cursor-pointer"
        >
          <Pencil size={12} /> Editar
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-text-muted
                     hover:bg-danger/5 hover:text-danger transition-colors cursor-pointer disabled:opacity-50"
        >
          {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          Cancelar
        </button>
      </div>
    </div>
  );
}

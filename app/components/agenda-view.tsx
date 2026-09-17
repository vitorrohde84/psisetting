"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { decryptClinicalData , ehCifrado } from "@/utils/crypto";
import { useSubscription } from "@/utils/subscription-context";
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
  FileText,
  DollarSign,
  CheckCircle2,
} from "lucide-react";
import dynamic from "next/dynamic";

const AgendamentoFormModal = dynamic(
  () => import("./agendamento-form-modal").then((m) => m.AgendamentoFormModal),
  { ssr: false }
);
const ProntuarioFormModal = dynamic(
  () => import("./prontuario-form-modal").then((m) => m.ProntuarioFormModal),
  { ssr: false }
);
const PagamentoFormModal = dynamic(
  () => import("./pagamento-form-modal").then((m) => m.PagamentoFormModal),
  { ssr: false }
);

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
  pacientes?: any;
  has_prontuario?: boolean;
  has_pagamento?: boolean;
  pagamento_status?: string;
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
  const { isReadOnly, openSubscriptionModal } = useSubscription();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingAg, setEditingAg] = useState<Agendamento | null>(null);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [prefillAgData, setPrefillAgData] = useState<any>(null);
  const [showIcsInfo, setShowIcsInfo] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [syncTab, setSyncTab] = useState<"iphone" | "google">("iphone");
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadCalendarToken = useCallback(async () => {
    setLoadingToken(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("calendar_token")
        .eq("id", user.id)
        .single();

      if (profile?.calendar_token) {
        setCalendarToken(profile.calendar_token);
      } else {
        // `calendar_token` deixou de ser gravável pelo próprio usuário (A01):
        // a escrita direta daqui tomaria erro 42501 e morreria num
        // console.error, deixando a tela exibir um link que nunca foi salvo.
        // A geração passa pela rota de servidor, que é a mesma usada pelo
        // botão de regenerar em Configurações.
        const resposta = await fetch("/api/calendar/regenerate-token", {
          method: "POST",
          credentials: "same-origin",
        });

        if (!resposta.ok) {
          console.error(
            "Não foi possível gerar o link do calendário:",
            resposta.status
          );
          setCalendarToken(null);
          return;
        }

        const { calendar_token } = await resposta.json();
        setCalendarToken(calendar_token ?? null);
      }
    } catch (err) {
      console.error("Erro ao carregar token do calendário:", err);
    } finally {
      setLoadingToken(false);
    }
  }, []);

  useEffect(() => {
    loadCalendarToken();
  }, [loadCalendarToken]);

  function copyCalUrl() {
    if (!calendarToken || typeof window === "undefined") return;
    const url = `${window.location.origin}/calendario/${calendarToken}`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  }

  // Cross-module Modals
  const [showProntuarioModal, setShowProntuarioModal] = useState(false);
  const [showPagamentoModal, setShowPagamentoModal] = useState(false);
  const [actionPrefillData, setActionPrefillData] = useState<{ paciente_id: string; data?: string; data_vencimento?: string } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Compute month boundaries for query
  const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0);
  const lastDayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  const fetchAgendamentos = useCallback(async () => {
    setLoading(true);

    const [agsRes, prontRes, pagRes] = await Promise.all([
      supabase
        .from("agendamentos")
        .select("id, paciente_id, data, horario, duracao_minutos, modalidade, status, observacoes, psicologo_id, pacientes(nome)")
        .gte("data", firstDay)
        .lte("data", lastDayStr)
        .order("data", { ascending: true })
        .order("horario", { ascending: true }),
      supabase
        .from("prontuarios")
        .select("paciente_id, data")
        .gte("data", firstDay)
        .lte("data", lastDayStr),
      supabase
        .from("pagamentos")
        .select("paciente_id, data_vencimento, agendamento_id, status")
        .gte("data_vencimento", firstDay)
        .lte("data_vencimento", lastDayStr),
    ]);

    const prontSet = new Set(prontRes.data?.map(p => `${p.paciente_id}_${p.data}`));
    const pagMap = new Map();
    pagRes.data?.forEach(p => {
      // Prioriza pelo agendamento_id, ou pelo paciente+data
      if (p.agendamento_id) {
        pagMap.set(p.agendamento_id, p.status);
      } else {
        pagMap.set(`${p.paciente_id}_${p.data_vencimento}`, p.status);
      }
    });

    const { data: { user } } = await supabase.auth.getUser();

    const enhancedAgs = await Promise.all(
      (agsRes.data || []).map(async (ag) => {
        const pStatus =
          pagMap.get(ag.id) || pagMap.get(`${ag.paciente_id}_${ag.data}`);
        
        let pacienteNome = (ag.pacientes as any)?.nome || "Paciente";
        if (user && (ag.pacientes as any)?.nome) {
          pacienteNome = await decryptClinicalData(
            (ag.pacientes as any).nome,
            user.id
          );
        }

        let observacoesDecrypted = ag.observacoes;
        if (user && ag.observacoes && ehCifrado(ag.observacoes)) {
          observacoesDecrypted = await decryptClinicalData(ag.observacoes, user.id);
        }

        return {
          ...ag,
          observacoes: observacoesDecrypted,
          pacientes: {
            nome: pacienteNome,
          },
          has_prontuario: prontSet.has(`${ag.paciente_id}_${ag.data}`),
          has_pagamento: !!pStatus,
          pagamento_status: pStatus,
        };
      })
    );

    setAgendamentos(enhancedAgs as any);
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
    if (isReadOnly) {
      openSubscriptionModal();
      return;
    }
    setPrefillDate(dateStr);
    setPrefillAgData(null);
    setEditingAg(null);
    setShowModal(true);
  }

  function handleNew() {
    if (isReadOnly) {
      openSubscriptionModal();
      return;
    }
    setPrefillDate(null);
    setPrefillAgData(null);
    setEditingAg(null);
    setShowModal(true);
  }

  function handleEdit(ag: Agendamento) {
    setEditingAg(ag);
    setPrefillDate(null);
    setPrefillAgData(null);
    setShowModal(true);
  }

  function handleReplicate(ag: Agendamento) {
    if (isReadOnly) {
      openSubscriptionModal();
      return;
    }
    setEditingAg(null);
    setPrefillDate(null);
    
    // Calcula automaticamente a data para a próxima semana
    const dataAtual = new Date(ag.data + "T12:00:00");
    dataAtual.setDate(dataAtual.getDate() + 7);
    const proximaSemana = dataAtual.toISOString().split("T")[0];

    setPrefillAgData({
      paciente_id: ag.paciente_id,
      data: proximaSemana,
      horario: ag.horario,
      duracao_minutos: ag.duracao_minutos,
      modalidade: ag.modalidade,
      status: "agendado",
      observacoes: ag.observacoes,
    });
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
    setPrefillAgData(null);
  }

  async function handleSaved() {
    handleModalClose();
    await fetchAgendamentos();
  }

  function handleEvoluirProntuario(ag: Agendamento) {
    if (isReadOnly) {
      openSubscriptionModal();
      return;
    }
    setActionPrefillData({ paciente_id: ag.paciente_id, data: ag.data });
    setShowProntuarioModal(true);
  }

  function handleAdicionarPagamento(ag: Agendamento) {
    if (isReadOnly) {
      openSubscriptionModal();
      return;
    }
    setActionPrefillData({ paciente_id: ag.paciente_id, data_vencimento: ag.data });
    setShowPagamentoModal(true);
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
            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all cursor-pointer shadow-xs ${
              showIcsInfo
                ? "bg-primary text-white border-primary"
                : "bg-background border-border text-text-muted hover:border-primary/30 hover:text-text"
            }`}
            title="Sincronizar no iPhone, Mac ou Google Agenda"
          >
            <Smartphone size={16} />
            <span className="hidden sm:inline">Sincronizar Agenda</span>
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

      {/* Sincronização de Calendário */}
      {showIcsInfo && (
        <div className="bg-surface rounded-2xl border border-border shadow-md p-6 mb-6 animate-in fade-in zoom-in-98 duration-150">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Calendar size={20} />
              </div>
              <div>
                <h3 className="text-base font-serif font-semibold text-text">
                  Sincronização Automática da Agenda
                </h3>
                <p className="text-xs text-text-muted">
                  Veja seus atendimentos em tempo real no iPhone, iPad, Mac ou Google Agenda
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowIcsInfo(false)}
              className="p-1.5 rounded-xl text-text-muted hover:text-text hover:bg-background transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tabs de Instrução */}
          <div className="flex bg-background rounded-xl p-1 mb-4 max-w-xs">
            <button
              type="button"
              onClick={() => setSyncTab("iphone")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                syncTab === "iphone"
                  ? "bg-surface text-text shadow-xs font-semibold"
                  : "text-text-muted hover:text-text"
              }`}
            >
              📱 iPhone / Apple
            </button>
            <button
              type="button"
              onClick={() => setSyncTab("google")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                syncTab === "google"
                  ? "bg-surface text-text shadow-xs font-semibold"
                  : "text-text-muted hover:text-text"
              }`}
            >
              📅 Google Agenda
            </button>
          </div>

          {/* Passo a Passo */}
          {syncTab === "iphone" ? (
            <div className="space-y-2.5 text-sm text-text-muted mb-4 bg-background/50 p-4 rounded-xl border border-border/50">
              <p className="font-semibold text-text text-xs uppercase tracking-wider">
                Como ativar no seu iPhone / iPad:
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-xs text-text leading-relaxed">
                <li>Copie o seu <strong>Link Pessoal</strong> no botão abaixo.</li>
                <li>No seu iPhone, abra o app <strong>Ajustes</strong>.</li>
                <li>Toque em <strong>Calendário</strong> → <strong>Contas</strong> → <strong>Adicionar Conta</strong>.</li>
                <li>Selecione <strong>Outra</strong> e toque em <strong>Adicionar Calendário Assinado</strong>.</li>
                <li>Cole o link copiado e toque em <strong>Seguinte / Salvar</strong>.</li>
              </ol>
            </div>
          ) : (
            <div className="space-y-2.5 text-sm text-text-muted mb-4 bg-background/50 p-4 rounded-xl border border-border/50">
              <p className="font-semibold text-text text-xs uppercase tracking-wider">
                Como ativar no Google Agenda (Android / Computador):
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-xs text-text leading-relaxed">
                <li>Copie o seu <strong>Link Pessoal</strong> no botão abaixo.</li>
                <li>Acesse <strong>calendar.google.com</strong> no seu navegador.</li>
                <li>Na barra lateral esquerda, ao lado de <strong>Outras agendas</strong>, clique no <strong>+</strong>.</li>
                <li>Selecione <strong>Do URL</strong>.</li>
                <li>Cole o link copiado e clique em <strong>Adicionar agenda</strong>.</li>
              </ol>
            </div>
          )}

          {/* Campo com Link Pessoal Gerado */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
              Seu Link Exclusivo de Sincronização
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs text-text font-mono truncate select-all">
                {loadingToken
                  ? "Carregando seu link seguro..."
                  : calendarToken && typeof window !== "undefined"
                  ? `${window.location.origin}/calendario/${calendarToken}`
                  : "Carregando..."}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={copyCalUrl}
                  disabled={loadingToken || !calendarToken}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark active:scale-[0.98] transition-all cursor-pointer shadow-xs"
                >
                  {copiedUrl ? (
                    <>
                      <Check size={14} className="text-white" />
                      <span>Link Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Copiar Link</span>
                    </>
                  )}
                </button>

                {calendarToken && (
                  <a
                    href={`webcal://${typeof window !== "undefined" ? window.location.host : ""}/calendario/${calendarToken}`}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-border bg-background text-text text-xs font-medium hover:bg-surface active:scale-[0.98] transition-all cursor-pointer"
                    title="Assinar automaticamente com 1 toque no iPhone ou Mac"
                  >
                    <span>Abrir no iPhone</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-text-muted/70 mt-3">
            🔒 Este link é pessoal e intransferível. Somente os seus próprios agendamentos serão sincronizados.
          </p>
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
                              <span className="sensitive-data">{getPacienteName(ag).split(" ")[0]}</span>
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
                      onReplicate={() => handleReplicate(ag)}
                      onDelete={() => handleDelete(ag.id)}
                      isDeleting={deleting === ag.id}
                      onEvoluir={() => handleEvoluirProntuario(ag)}
                      onPagamento={() => handleAdicionarPagamento(ag)}
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
                            <p className="text-sm font-medium text-text truncate sensitive-data">{pacNome}</p>
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
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusInfo.class}`}>
                              {statusInfo.label}
                            </span>
                            <div className="flex items-center gap-1">
                              {/* Workflow Actions */}
                              <button
                                onClick={() => handleEvoluirProntuario(ag)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  ag.has_prontuario
                                    ? "text-success bg-success/10"
                                    : "text-text-muted hover:text-primary hover:bg-primary/10"
                                }`}
                                title={ag.has_prontuario ? "Prontuário preenchido" : "Evoluir prontuário"}
                              >
                                {ag.has_prontuario ? <CheckCircle2 size={14} /> : <FileText size={14} />}
                              </button>
                              <button
                                onClick={() => handleAdicionarPagamento(ag)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  ag.pagamento_status === "pago"
                                    ? "text-success bg-success/10"
                                    : ag.has_pagamento
                                    ? "text-warning-dark bg-warning/10"
                                    : "text-text-muted hover:text-primary hover:bg-primary/10"
                                }`}
                                title={ag.pagamento_status === "pago" ? "Pago" : ag.has_pagamento ? "Pagamento pendente" : "Adicionar pagamento"}
                              >
                                {ag.pagamento_status === "pago" ? <CheckCircle2 size={14} /> : ag.has_pagamento ? <Clock size={14} /> : <DollarSign size={14} />}
                              </button>
                              
                              <div className="w-[1px] h-4 bg-border mx-1" />

                              <button
                                onClick={() => handleEdit(ag)}
                                className="p-1.5 rounded-lg text-text-muted/50 hover:text-text-muted hover:bg-background transition-colors cursor-pointer"
                                title="Editar agendamento"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleReplicate(ag)}
                                className="p-1.5 rounded-lg text-text-muted/50 hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer"
                                title="Replicar para próxima semana"
                              >
                                <Copy size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(ag.id)}
                                disabled={deleting === ag.id}
                                className="p-1.5 rounded-lg text-text-muted/50 hover:text-danger hover:bg-danger/5 transition-colors cursor-pointer disabled:opacity-50"
                                title="Cancelar agendamento"
                              >
                                {deleting === ag.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              </button>
                            </div>
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
          prefillData={prefillAgData}
          onClose={handleModalClose}
          onSaved={handleSaved}
        />
      )}

      {showProntuarioModal && (
        <ProntuarioFormModal
          prontuario={null}
          prefillData={{ paciente_id: actionPrefillData?.paciente_id || "", data: actionPrefillData?.data || "" }}
          onClose={() => setShowProntuarioModal(false)}
          onSaved={() => { setShowProntuarioModal(false); fetchAgendamentos(); }}
        />
      )}

      {showPagamentoModal && (
        <PagamentoFormModal
          pagamento={null}
          prefillData={{ paciente_id: actionPrefillData?.paciente_id || "", data_vencimento: actionPrefillData?.data_vencimento || "" }}
          onClose={() => setShowPagamentoModal(false)}
          onSaved={() => { setShowPagamentoModal(false); fetchAgendamentos(); }}
        />
      )}
    </>
  );
}

/* ─── Small appointment card for the side panel ─── */
function AgendamentoCard({
  ag,
  onEdit,
  onReplicate,
  onDelete,
  isDeleting,
  onEvoluir,
  onPagamento,
}: {
  ag: Agendamento;
  onEdit: () => void;
  onReplicate: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  onEvoluir: () => void;
  onPagamento: () => void;
}) {
  const pacNome = getPacienteName(ag);
  const statusInfo = STATUS_MAP[ag.status] || STATUS_MAP.agendado;

  return (
    <div className="p-3 rounded-xl bg-background/60 border border-border/30">
      <div className="flex items-start justify-between mb-1.5">
        <div>
          <p className="text-sm font-medium text-text sensitive-data">{pacNome}</p>
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

      {/* Quick Actions (Workflow) */}
      <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-border/40">
        <button
          onClick={onEvoluir}
          className={`flex-1 inline-flex justify-center items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            ag.has_prontuario
              ? "bg-success/10 text-success"
              : "bg-surface hover:bg-primary/10 text-text-muted hover:text-primary"
          }`}
        >
          {ag.has_prontuario ? <CheckCircle2 size={12} /> : <FileText size={12} />}
          Prontuário
        </button>
        
        <button
          onClick={onPagamento}
          className={`flex-1 inline-flex justify-center items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            ag.pagamento_status === "pago"
              ? "bg-success/10 text-success"
              : ag.has_pagamento
              ? "bg-warning/10 text-warning-dark"
              : "bg-surface hover:bg-primary/10 text-text-muted hover:text-primary"
          }`}
        >
          {ag.pagamento_status === "pago" ? <CheckCircle2 size={12} /> : ag.has_pagamento ? <Clock size={12} /> : <DollarSign size={12} />}
          {ag.pagamento_status === "pago" ? "Pago" : ag.has_pagamento ? "Pendente" : "Pagamento"}
        </button>
      </div>

      <div className="flex items-center gap-1 mt-2">
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-text-muted
                     hover:bg-surface hover:text-text transition-colors cursor-pointer"
        >
          <Pencil size={12} /> Editar
        </button>
        <button
          onClick={onReplicate}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-text-muted
                     hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
        >
          <Copy size={12} /> Replicar
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

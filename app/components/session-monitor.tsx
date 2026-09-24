"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { decryptClinicalData , ehCifrado } from "@/utils/crypto";
import { Bell, FileText, DollarSign, X, ChevronUp, ChevronDown } from "lucide-react";
import { ProntuarioFormModal } from "./prontuario-form-modal";
import { PagamentoFormModal } from "./pagamento-form-modal";

// Relação pacientes(nome) do select. Em agendamentos -> pacientes (muitos para
// um) o Supabase devolve um objeto; getPacienteName aceita lista por segurança.
interface PacienteRelacionado {
  nome?: string | null;
}

interface Agendamento {
  id: string;
  paciente_id: string;
  data: string;
  horario: string;
  duracao_minutos: number | null;
  status: string;
  pacientes?: PacienteRelacionado | PacienteRelacionado[] | null;
  has_prontuario?: boolean;
  has_pagamento?: boolean;
}

// Busca os agendamentos de hoje já marcados com prontuário e pagamento.
// Fica fora do componente e devolve a lista em vez de gravar no estado: assim
// o efeito de montagem só grava depois do await (não no corpo do efeito) e a
// função não depende do cliente do Supabase criado a cada render.
async function buscarAgendamentosDeHoje(): Promise<Agendamento[]> {
  const supabase = createClient();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const [agsRes, prontRes, pagRes] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("id, paciente_id, data, horario, duracao_minutos, status, pacientes(nome)")
      .eq("data", todayStr)
      .in("status", ["agendado", "confirmado", "realizado"]), // only valid statuses
    supabase
      .from("prontuarios")
      .select("paciente_id")
      .eq("data", todayStr),
    supabase
      .from("pagamentos")
      .select("paciente_id")
      .eq("data_vencimento", todayStr),
  ]);

  const { data: { user } } = await supabase.auth.getUser();

  // O status é baseado no paciente_id E data, já que filtramos por "hoje"
  const prontSet = new Set(prontRes.data?.map(p => p.paciente_id));
  const pagSet = new Set(pagRes.data?.map(p => p.paciente_id));

  return Promise.all(
    (agsRes.data || []).map(async (ag) => {
      let pacNome = (ag.pacientes as PacienteRelacionado | null | undefined)?.nome || "Paciente";
      if (user && pacNome && ehCifrado(pacNome)) {
        pacNome = await decryptClinicalData(pacNome, user.id);
      }

      return {
        ...ag,
        pacientes: {
          nome: pacNome,
        },
        has_prontuario: prontSet.has(ag.paciente_id),
        has_pagamento: pagSet.has(ag.paciente_id),
      };
    })
  );
}

export function SessionMonitor() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [pendingSessions, setPendingSessions] = useState<Agendamento[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [closedForSession, setClosedForSession] = useState(false); // If user dismisses it entirely

  // Modals
  const [showProntuarioModal, setShowProntuarioModal] = useState(false);
  const [showPagamentoModal, setShowPagamentoModal] = useState(false);
  const [actionPrefillData, setActionPrefillData] = useState<{ paciente_id: string; data?: string; data_vencimento?: string } | null>(null);

  // Recarrega depois de salvar prontuário ou pagamento pelos modais abaixo.
  function fetchTodayData() {
    buscarAgendamentosDeHoje().then(setAgendamentos);
  }

  // Initial fetch
  useEffect(() => {
    buscarAgendamentosDeHoje().then(setAgendamentos);
  }, []);

  // Check intervals
  useEffect(() => {
    const checkPending = () => {
      if (agendamentos.length === 0) {
        setPendingSessions([]);
        return;
      }

      const now = new Date();

      const pending = agendamentos.filter(ag => {
        // Se já tem ambos, não é pendente
        if (ag.has_prontuario && ag.has_pagamento) return false;

        if (!ag.horario) return false;

        // Calcular hora de término
        const [h, m] = ag.horario.split(":").map(Number);
        const endDate = new Date();
        endDate.setHours(h, m + (ag.duracao_minutos || 50), 0, 0);

        // Se a hora atual já passou do término da sessão, é pendente
        return now >= endDate;
      });

      setPendingSessions(pending);
    };

    checkPending(); // run immediately on change
    const interval = setInterval(checkPending, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [agendamentos]);

  if (closedForSession || pendingSessions.length === 0) {
    return null; // Don't render anything if there's no pending session or user dismissed
  }

  function getPacienteName(ag: Agendamento): string {
    const p = ag.pacientes;
    if (!p) return "Paciente";
    if (Array.isArray(p)) return p[0]?.nome || "Paciente";
    return p.nome || "Paciente";
  }

  function handleEvoluirProntuario(ag: Agendamento) {
    setActionPrefillData({ paciente_id: ag.paciente_id, data: ag.data });
    setShowProntuarioModal(true);
  }

  function handleAdicionarPagamento(ag: Agendamento) {
    setActionPrefillData({ paciente_id: ag.paciente_id, data_vencimento: ag.data });
    setShowPagamentoModal(true);
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end">
        {/* Floating Panel */}
        <div className={`bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 ease-in-out ${expanded ? "w-80 mb-4 opacity-100 translate-y-0" : "w-0 h-0 mb-0 opacity-0 translate-y-4"}`}>
          <div className="bg-primary/10 border-b border-border/40 px-4 py-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
              <Bell size={16} />
              Ações Pendentes ({pendingSessions.length})
            </h4>
            <button onClick={() => setClosedForSession(true)} className="text-text-muted hover:text-text transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2 space-y-2">
            {pendingSessions.map(ag => (
              <div key={ag.id} className="p-3 bg-background/50 rounded-xl border border-border/40">
                <p className="text-sm font-medium text-text mb-1 truncate">
                  {ag.horario.slice(0, 5)} - <span className="sensitive-data">{getPacienteName(ag)}</span>
                </p>
                <div className="flex gap-2 mt-2">
                  {!ag.has_prontuario && (
                    <button
                      onClick={() => handleEvoluirProntuario(ag)}
                      className="flex-1 inline-flex justify-center items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-surface hover:bg-primary/10 text-text-muted hover:text-primary transition-colors cursor-pointer"
                    >
                      <FileText size={12} /> Prontuário
                    </button>
                  )}
                  {!ag.has_pagamento && (
                    <button
                      onClick={() => handleAdicionarPagamento(ag)}
                      className="flex-1 inline-flex justify-center items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-surface hover:bg-primary/10 text-text-muted hover:text-primary transition-colors cursor-pointer"
                    >
                      <DollarSign size={12} /> Pagamento
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Floating Button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95 cursor-pointer ${expanded ? "bg-surface text-text border border-border" : "bg-primary text-white animate-bounce"
            }`}
        >
          <Bell size={20} className={!expanded ? "animate-pulse" : ""} />
          {!expanded && (
            <span className="text-sm font-semibold pr-1">
              {pendingSessions.length} pendência{pendingSessions.length > 1 ? "s" : ""}
            </span>
          )}
          {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>

      {/* Modals */}
      {showProntuarioModal && (
        <ProntuarioFormModal
          prontuario={null}
          prefillData={{ paciente_id: actionPrefillData?.paciente_id || "", data: actionPrefillData?.data || "" }}
          onClose={() => setShowProntuarioModal(false)}
          onSaved={() => { setShowProntuarioModal(false); fetchTodayData(); }}
        />
      )}

      {showPagamentoModal && (
        <PagamentoFormModal
          pagamento={null}
          prefillData={{ paciente_id: actionPrefillData?.paciente_id || "", data_vencimento: actionPrefillData?.data_vencimento || "" }}
          onClose={() => setShowPagamentoModal(false)}
          onSaved={() => { setShowPagamentoModal(false); fetchTodayData(); }}
        />
      )}
    </>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Search, Plus, Filter, FileText, Pencil, Calendar, Clock, Loader2, FileClock } from "lucide-react";
import { ProntuarioFormModal } from "./prontuario-form-modal";

interface Prontuario {
  id: string;
  data: string;
  conteudo: string;
  created_at: string;
  paciente_id: string;
  agendamento_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pacientes?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agendamentos?: any;
}

interface PacienteOption {
  id: string;
  nome: string;
}

export function ProntuarioList() {
  const supabase = createClient();
  const [prontuarios, setProntuarios] = useState<Prontuario[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState("");
  const [pacienteFilter, setPacienteFilter] = useState<string>("all");
  const [pacientesOptions, setPacientesOptions] = useState<PacienteOption[]>([]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingProntuario, setEditingProntuario] = useState<Prontuario | null>(null);

  const fetchProntuarios = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("prontuarios")
      .select("id, data, conteudo, created_at, paciente_id, agendamento_id, pacientes(nome), agendamentos(horario)")
      .order("data", { ascending: false })
      .order("created_at", { ascending: false });

    if (pacienteFilter !== "all") {
      query = query.eq("paciente_id", pacienteFilter);
    }
    if (search) {
      query = query.ilike("conteudo", `%${search}%`);
    }

    const { data } = await query;
    setProntuarios(data || []);
    setLoading(false);
  }, [pacienteFilter, search]);

  useEffect(() => {
    // Fetch filter options once
    async function fetchOptions() {
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome")
        .order("nome", { ascending: true });
      setPacientesOptions(data || []);
    }
    fetchOptions();
  }, []);

  useEffect(() => {
    // Debounce search slightly
    const timer = setTimeout(() => {
      fetchProntuarios();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchProntuarios, search, pacienteFilter]);

  function getPacienteName(p: Prontuario): string {
    const pac = p.pacientes;
    if (!pac) return "Paciente desconhecido";
    if (Array.isArray(pac)) return pac[0]?.nome || "Paciente";
    return pac.nome || "Paciente";
  }

  function getAgendamentoHorario(p: Prontuario): string | null {
    const ag = p.agendamentos;
    if (!ag) return null;
    let horario;
    if (Array.isArray(ag)) horario = ag[0]?.horario;
    else horario = ag.horario;
    return horario ? horario.slice(0, 5) : null;
  }

  function handleEdit(p: Prontuario) {
    setEditingProntuario(p);
    setShowModal(true);
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-serif font-semibold text-text">Prontuários</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Evolução clínica e anotações das sessões
          </p>
        </div>
        <button
          onClick={() => {
            setEditingProntuario(null);
            setShowModal(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                     bg-primary text-white text-sm font-medium
                     hover:bg-primary-dark active:scale-[0.98]
                     transition-all duration-200 cursor-pointer shrink-0"
        >
          <Plus size={18} />
          Novo Prontuário
        </button>
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-xl border border-border/60 p-4 mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/50" size={16} />
          <input
            type="text"
            placeholder="Buscar palavra-chave no conteudo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-background border border-border text-text text-sm
                       focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
        <div className="relative sm:w-64 shrink-0">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/50" size={16} />
          <select
            value={pacienteFilter}
            onChange={(e) => setPacienteFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-background border border-border text-text text-sm
                       focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
          >
            <option value="all">Todos os pacientes</option>
            {pacientesOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Timeline List */}
      <div className="bg-surface rounded-xl border border-border/60 overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Loader2 size={28} className="animate-spin text-primary mb-3" />
            <p className="text-sm text-text-muted">Carregando prontuários...</p>
          </div>
        ) : prontuarios.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-4">
            <FileClock size={36} className="text-border mb-3" />
            <h3 className="text-base font-medium text-text mb-1">Nenhum prontuário encontrado</h3>
            <p className="text-sm text-text-muted">
              {search || pacienteFilter !== "all"
                ? "Tente ajustar os filtros de busca."
                : "Você ainda não registrou nenhuma evolução clínica."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {prontuarios.map((p) => {
              const dataSessao = new Date(p.data + "T12:00:00").toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric"
              });
              const dataCriacao = new Date(p.created_at).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
              });
              const horarioSessao = getAgendamentoHorario(p);

              return (
                <div key={p.id} className="p-5 md:p-6 hover:bg-background/30 transition-colors">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    {/* Left Column: Metadata */}
                    <div className="md:w-1/3 xl:w-1/4 shrink-0">
                      <h4 className="text-sm font-medium text-text mb-1 flex items-center gap-2">
                        {getPacienteName(p)}
                      </h4>
                      <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/5 w-fit px-2 py-1 rounded-md mb-2">
                        <Calendar size={13} />
                        <span className="capitalize">{dataSessao}</span>
                      </div>
                      
                      {horarioSessao && (
                        <div className="flex items-center gap-1.5 text-xs text-text-muted mb-1">
                          <Clock size={13} />
                          Vinculado à sessão das {horarioSessao}
                        </div>
                      )}
                      <div className="text-[11px] text-text-muted/70 mt-3">
                        Registrado em {dataCriacao}
                      </div>

                      <button
                        onClick={() => handleEdit(p)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-primary mt-3 transition-colors cursor-pointer"
                      >
                        <Pencil size={12} />
                        Editar
                      </button>
                    </div>

                    {/* Right Column: Content */}
                    <div className="flex-1 bg-background/50 rounded-xl p-4 border border-border/30">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText size={14} className="text-text-muted/60" />
                        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                          Evolução
                        </span>
                      </div>
                      <p className="text-sm md:text-base text-text font-serif leading-relaxed whitespace-pre-wrap">
                        {p.conteudo}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <ProntuarioFormModal
          prontuario={editingProntuario}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchProntuarios();
          }}
        />
      )}
    </>
  );
}

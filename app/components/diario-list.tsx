"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Search, Plus, Filter, FileText, Pencil, Calendar, Loader2, BookOpen } from "lucide-react";
import { DiarioFormModal } from "./diario-form-modal";

interface Diario {
  id: string;
  data: string;
  conteudo: string;
  created_at: string;
  paciente_id: string;
  agendamento_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pacientes?: any;
}

interface PacienteOption {
  id: string;
  nome: string;
}

export function DiarioList() {
  const supabase = createClient();
  const [diarios, setDiarios] = useState<Diario[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState("");
  const [pacienteFilter, setPacienteFilter] = useState<string>("all");
  const [pacientesOptions, setPacientesOptions] = useState<PacienteOption[]>([]);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingDiario, setEditingDiario] = useState<Diario | null>(null);

  const fetchDiarios = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("diario_bordo")
      .select("id, data, conteudo, created_at, paciente_id, agendamento_id, pacientes(nome)")
      .order("data", { ascending: false })
      .order("created_at", { ascending: false });

    if (pacienteFilter !== "all") {
      query = query.eq("paciente_id", pacienteFilter);
    }
    if (search) {
      query = query.ilike("conteudo", `%${search}%`);
    }

    const { data } = await query;
    setDiarios(data || []);
    setLoading(false);
  }, [pacienteFilter, search]);

  useEffect(() => {
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
    const timer = setTimeout(() => {
      fetchDiarios();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchDiarios, search, pacienteFilter]);

  function getPacienteName(d: Diario): string {
    const pac = d.pacientes;
    if (!pac) return "Paciente desconhecido";
    if (Array.isArray(pac)) return pac[0]?.nome || "Paciente";
    return pac.nome || "Paciente";
  }

  function handleEdit(d: Diario) {
    setEditingDiario(d);
    setShowModal(true);
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-serif font-semibold text-text">Notas Confidenciais</h2>
        </div>
        <button
          onClick={() => {
            setEditingDiario(null);
            setShowModal(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                     bg-primary text-white text-sm font-medium
                     hover:bg-primary-dark active:scale-[0.98]
                     transition-all duration-200 cursor-pointer shrink-0"
        >
          <Plus size={18} />
          Nova Anotação
        </button>
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-xl border border-border/60 p-4 mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/50" size={16} />
          <input
            type="text"
            placeholder="Buscar nas anotações..."
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
          </div>
        ) : diarios.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-4">
            <BookOpen size={36} className="text-border mb-3" />
            <h3 className="text-base font-medium text-text mb-1">Nenhuma anotação</h3>
            <p className="text-sm text-text-muted">
              Comece a documentar os bastidores das suas sessões.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {diarios.map((d) => {
              const dataSessao = new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric"
              });

              return (
                <div key={d.id} className="p-5 md:p-6 hover:bg-background/30 transition-colors">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    {/* Metadata */}
                    <div className="md:w-1/3 xl:w-1/4 shrink-0">
                      <h4 className="text-sm font-medium text-text mb-1 flex items-center gap-2">
                        {getPacienteName(d)}
                      </h4>
                      <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/5 w-fit px-2 py-1 rounded-md mb-2">
                        <Calendar size={13} />
                        <span className="capitalize">{dataSessao}</span>
                      </div>
                      <button
                        onClick={() => handleEdit(d)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-primary mt-3 transition-colors cursor-pointer"
                      >
                        <Pencil size={12} />
                        Editar anotação
                      </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 bg-background/50 rounded-xl p-4 border border-border/30">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText size={14} className="text-text-muted/60" />
                        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                          Registro Oculto
                        </span>
                      </div>
                      <p className="text-sm md:text-base text-text font-serif leading-relaxed whitespace-pre-wrap select-none">
                        {d.conteudo}
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
        <DiarioFormModal
          diario={editingDiario}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchDiarios();
          }}
        />
      )}
    </>
  );
}

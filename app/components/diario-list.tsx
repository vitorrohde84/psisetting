"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useSubscription } from "@/utils/subscription-context";
import { Search, Plus, Filter, FileText, Pencil, Calendar, Loader2, BookOpen, ShieldCheck } from "lucide-react";
import dynamic from "next/dynamic";

const DiarioFormModal = dynamic(
  () => import("./diario-form-modal").then((m) => m.DiarioFormModal),
  { ssr: false }
);
import { decryptClinicalData } from "@/utils/crypto";

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
  const { isReadOnly, openSubscriptionModal } = useSubscription();
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let query = supabase
      .from("diario_bordo")
      .select("id, data, conteudo, created_at, paciente_id, agendamento_id, pacientes(nome)")
      .order("data", { ascending: false })
      .order("created_at", { ascending: false });

    if (pacienteFilter !== "all") {
      query = query.eq("paciente_id", pacienteFilter);
    }

    const { data } = await query;
    
    if (data && user) {
      // Descriptografa os registros na memória da sessão do psicólogo
      const decryptedList = await Promise.all(
        data.map(async (d) => ({
          ...d,
          conteudo: await decryptClinicalData(d.conteudo, user.id),
        }))
      );

      // Filtro de busca textual na memória decifrada
      const filtered = search.trim()
        ? decryptedList.filter(
            (d) =>
              d.conteudo.toLowerCase().includes(search.toLowerCase()) ||
              getPacienteName(d).toLowerCase().includes(search.toLowerCase())
          )
        : decryptedList;

      setDiarios(filtered);
    } else {
      setDiarios([]);
    }

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
          <h2 className="text-2xl font-serif font-semibold text-text flex items-center gap-2">
            <span>Diário de Bordo & Supervisão</span>
            <span className="text-xs font-sans px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20 flex items-center gap-1 font-normal">
              <ShieldCheck size={12} /> Criptografia AES-256
            </span>
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Espaço confidencial para elaboração clínica, hipóteses de manejo e anotações para supervisão.
          </p>
        </div>
        <button
          onClick={() => {
            if (isReadOnly) {
              openSubscriptionModal();
              return;
            }
            setEditingDiario(null);
            setShowModal(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                     bg-primary text-white text-sm font-medium
                     hover:bg-primary-dark active:scale-[0.98]
                     transition-all duration-200 cursor-pointer shrink-0 shadow-xs"
        >
          <Plus size={18} />
          Nova Anotação
        </button>
      </div>

      {/* Card de Identidade Clínica e Supervisão */}
      <div className="mb-6 p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200/80 flex items-start gap-3 text-xs text-teal-950">
        <BookOpen size={16} className="text-teal-800 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-bold text-teal-900">Da Sessão à Supervisão Clínica</p>
          <p className="text-[11px] text-teal-800 leading-relaxed">
            Utilize este espaço para registrar contratransferências, reflexões teóricas e dúvidas para supervisão. Estas notas ficam protegidas com chave individual para apoiar a elaboração contínua do caso.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-xl border border-border/60 p-4 mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/50" size={16} />
          <input
            type="text"
            placeholder="Buscar nas anotações descriptografadas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-background border border-border text-text text-sm
                       focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>

        <div className="relative sm:w-64">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/50" size={16} />
          <select
            value={pacienteFilter}
            onChange={(e) => setPacienteFilter(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-background border border-border text-text text-sm
                       focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
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

      {/* List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <Loader2 className="animate-spin mb-3 text-primary" size={24} />
          <p className="text-sm">Decifrando anotações seguras…</p>
        </div>
      ) : diarios.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border/60 p-12 text-center">
          <BookOpen className="mx-auto text-text-muted/30 mb-3" size={40} />
          <h3 className="text-base font-serif font-medium text-text mb-1">
            Nenhuma anotação encontrada
          </h3>
          <p className="text-sm text-text-muted max-w-sm mx-auto">
            {search || pacienteFilter !== "all"
              ? "Tente ajustar os filtros de busca."
              : "Registre o que aconteceu nas sessões com sigilo clínico e criptografia de ponta a ponta."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {diarios.map((d) => (
            <div
              key={d.id}
              onClick={() => handleEdit(d)}
              className="bg-surface rounded-xl border border-border/60 p-5 hover:border-primary/30 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-4 mb-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-serif font-semibold text-text truncate">
                    {getPacienteName(d)}
                  </span>
                  <span className="text-xs text-text-muted/60 flex items-center gap-1 shrink-0">
                    <Calendar size={12} />
                    {new Date(d.data + "T00:00:00").toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(d);
                  }}
                  className="text-text-muted hover:text-primary p-1 rounded-lg hover:bg-background transition-colors shrink-0"
                >
                  <Pencil size={15} />
                </button>
              </div>
              <p className="text-sm text-text-muted line-clamp-3 leading-relaxed whitespace-pre-wrap font-serif select-none sensitive-data">
                {d.conteudo}
              </p>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <DiarioFormModal
          diario={editingDiario}
          onClose={() => {
            setShowModal(false);
            setEditingDiario(null);
          }}
          onSaved={() => {
            setShowModal(false);
            setEditingDiario(null);
            fetchDiarios();
          }}
        />
      )}
    </>
  );
}

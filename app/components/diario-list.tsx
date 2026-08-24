"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useSubscription } from "@/utils/subscription-context";
import {
  Search,
  Plus,
  Filter,
  FileText,
  Pencil,
  Calendar,
  Loader2,
  BookOpen,
  ShieldCheck,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  Tag,
  Activity,
  Heart,
  Users as UsersIcon,
  Layers,
} from "lucide-react";
import dynamic from "next/dynamic";

const DiarioFormModal = dynamic(
  () => import("./diario-form-modal").then((m) => m.DiarioFormModal),
  { ssr: false }
);
import { decryptClinicalData } from "@/utils/crypto";
import { analyzeClinicalEvolutions, ThemeInsight } from "@/utils/clinical-analyzer";

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
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 15;

  // Radar de Temas & Inteligência Clínica
  const [showRadar, setShowRadar] = useState(false);
  const [activeThemeFilter, setActiveThemeFilter] = useState<string | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingDiario, setEditingDiario] = useState<Diario | null>(null);

  const fetchDiarios = useCallback(async (pageNum = 0, isLoadMore = false) => {
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setPage(0);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const from = pageNum * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("diario_bordo")
      .select("id, data, conteudo, created_at, paciente_id, agendamento_id, pacientes(nome)")
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (pacienteFilter !== "all") {
      query = query.eq("paciente_id", pacienteFilter);
    }

    const { data } = await query;
    
    if (data && user) {
      // Descriptografa os registros na memória da sessão do psicólogo
      const decryptedList = await Promise.all(
        data.map(async (d) => {
          let pacNome = (d.pacientes as any)?.nome || "Paciente";
          if (pacNome && pacNome.startsWith("enc:v1:")) {
            pacNome = await decryptClinicalData(pacNome, user.id);
          }
          return {
            ...d,
            pacientes: { nome: pacNome },
            conteudo: await decryptClinicalData(d.conteudo, user.id),
          };
        })
      );

      // Filtro de busca textual na memória decifrada
      const filtered = search.trim()
        ? decryptedList.filter(
            (d) =>
              d.conteudo.toLowerCase().includes(search.toLowerCase()) ||
              getPacienteName(d).toLowerCase().includes(search.toLowerCase())
          )
        : decryptedList;

      if (isLoadMore) {
        setDiarios((prev) => [...prev, ...filtered]);
      } else {
        setDiarios(filtered);
      }
      setHasMore(data.length === PAGE_SIZE);
    } else {
      if (!isLoadMore) setDiarios([]);
      setHasMore(false);
    }

    setLoading(false);
    setLoadingMore(false);
  }, [pacienteFilter, search]);

  function handleLoadMore() {
    if (loadingMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchDiarios(nextPage, true);
  }

  useEffect(() => {
    async function fetchOptions() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data } = await supabase
        .from("pacientes")
        .select("id, nome")
        .order("nome", { ascending: true });

      if (data && user) {
        const decrypted = await Promise.all(
          data.map(async (p) => ({
            ...p,
            nome: await decryptClinicalData(p.nome, user.id),
          }))
        );
        decrypted.sort((a, b) => a.nome.localeCompare(b.nome));
        setPacientesOptions(decrypted);
      } else {
        setPacientesOptions(data || []);
      }
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

  // Motor de Inteligência Clínica (100% Client-Side na memória da sessão)
  const insights = useMemo(() => {
    return analyzeClinicalEvolutions(diarios);
  }, [diarios]);

  const displayedDiarios = useMemo(() => {
    if (!activeThemeFilter) return diarios;
    const termLower = activeThemeFilter.toLowerCase();
    return diarios.filter((d) => d.conteudo.toLowerCase().includes(termLower));
  }, [diarios, activeThemeFilter]);

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

      {/* ─── RADAR DE TEMAS & ESTUDO DE CASO (100% Client-Side) ─── */}
      {diarios.length > 0 && insights.topKeywords.length > 0 && (
        <div className="mb-6 rounded-2xl bg-surface border border-primary/20 shadow-xs overflow-hidden transition-all">
          <div
            onClick={() => setShowRadar(!showRadar)}
            className="p-4 bg-primary/5 hover:bg-primary/10 flex items-center justify-between cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Sparkles size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-serif font-bold text-sm text-text">
                    Radar de Temas & Estudo de Caso
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary">
                    {insights.topKeywords.length} tópicos identificados
                  </span>
                </div>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Mapeamento automático de queixas, afetos e figuras centrais das suas anotações.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {activeThemeFilter && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-primary px-2.5 py-1 rounded-lg bg-primary/10">
                  <Tag size={12} /> #{activeThemeFilter}
                </span>
              )}
              <button
                type="button"
                className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-background transition-colors"
              >
                {showRadar ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>

          {showRadar && (
            <div className="p-5 border-t border-border/40 space-y-4 animate-in fade-in-50 duration-200">
              <div className="flex flex-wrap gap-2 items-center">
                {insights.topKeywords.map((item) => {
                  const isActive = activeThemeFilter === item.term;

                  const categoryStyles = {
                    sintoma: "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100",
                    emocional: "bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100",
                    relacional: "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
                    contexto: "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100",
                    geral: "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100",
                  };

                  const badgeStyle = categoryStyles[item.category] || categoryStyles.geral;

                  return (
                    <button
                      key={item.term}
                      type="button"
                      onClick={() =>
                        setActiveThemeFilter(isActive ? null : item.term)
                      }
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        isActive
                          ? "bg-primary text-white border-primary shadow-xs ring-2 ring-primary/20 scale-105"
                          : badgeStyle
                      }`}
                    >
                      <span>#{item.term}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isActive
                            ? "bg-white/20 text-white"
                            : "bg-black/5 text-text-muted"
                        }`}
                      >
                        {item.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {activeThemeFilter && (
                <div className="flex items-center justify-between pt-2 border-t border-border/30 text-xs">
                  <span className="text-text-muted">
                    Exibindo <strong>{displayedDiarios.length}</strong> anotação(ões) contendo <strong>#{activeThemeFilter}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveThemeFilter(null)}
                    className="inline-flex items-center gap-1 text-primary hover:underline font-bold cursor-pointer"
                  >
                    <X size={12} /> Limpar filtro de tema
                  </button>
                </div>
              )}

              <div className="pt-2 text-[10px] text-text-muted/70 flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-primary" />
                <span>Análise de estudo de caso 100% processada na memória do seu navegador com sigilo absoluto.</span>
              </div>
            </div>
          )}
        </div>
      )}

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
      ) : displayedDiarios.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border/60 p-12 text-center">
          <BookOpen className="mx-auto text-text-muted/30 mb-3" size={40} />
          <h3 className="text-base font-serif font-medium text-text mb-1">
            Nenhuma anotação encontrada
          </h3>
          <p className="text-sm text-text-muted max-w-sm mx-auto">
            {search || pacienteFilter !== "all" || activeThemeFilter
              ? "Tente ajustar os filtros de busca ou tema."
              : "Registre o que aconteceu nas sessões com sigilo clínico e criptografia de ponta a ponta."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedDiarios.map((d) => (
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

          {hasMore && (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface border border-border text-xs font-semibold text-text hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-primary" />
                    <span>Carregando anotações anteriores...</span>
                  </>
                ) : (
                  <span>Carregar mais anotações</span>
                )}
              </button>
            </div>
          )}
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

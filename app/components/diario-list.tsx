"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useSubscription } from "@/utils/subscription-context";
import {
  Search,
  Plus,
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
  ArrowLeft,
  Users,
} from "lucide-react";
import dynamic from "next/dynamic";

const DiarioFormModal = dynamic(
  () => import("./diario-form-modal").then((m) => m.DiarioFormModal),
  { ssr: false }
);
import { decryptClinicalData } from "@/utils/crypto";
import { analyzeClinicalEvolutions } from "@/utils/clinical-analyzer";

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

interface PacienteResumo {
  id: string;
  nome: string;
  total: number;
  ultimaData: string | null;
}

export function DiarioList() {
  const supabase = createClient();
  const { isReadOnly, openSubscriptionModal } = useSubscription();

  // Lista de Pacientes (Visão Master)
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [loadingPacientes, setLoadingPacientes] = useState(true);
  const [search, setSearch] = useState("");

  // Visão do Paciente Selecionado (Visão Detail - Caderno Clínico)
  const [selectedPacienteId, setSelectedPacienteId] = useState<string | null>(null);
  const [diariosPaciente, setDiariosPaciente] = useState<Diario[]>([]);
  const [loadingDiarios, setLoadingDiarios] = useState(false);
  const [loadingMoreDiarios, setLoadingMoreDiarios] = useState(false);
  const [hasMoreDiarios, setHasMoreDiarios] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 12;

  // Radar de Temas & Estudo de Caso (Exclusivo do Paciente Selecionado)
  const [showRadar, setShowRadar] = useState(false);
  const [activeThemeFilter, setActiveThemeFilter] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingDiario, setEditingDiario] = useState<Diario | null>(null);
  const [prefillData, setPrefillData] = useState<{ paciente_id: string } | undefined>(undefined);

  // 1. Busca resumo dos pacientes com contagem de anotações do diário
  const fetchResumoPacientes = useCallback(async () => {
    setLoadingPacientes(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const [pacsRes, diariosRes] = await Promise.all([
      supabase
        .from("pacientes")
        .select("id, nome, created_at")
        .eq("ativo", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("diario_bordo")
        .select("paciente_id, data")
        .order("data", { ascending: false }),
    ]);

    if (pacsRes.data && user) {
      // Mapear contagens e última data de anotação por paciente
      const statsMap = new Map<string, { total: number; ultimaData: string | null }>();
      (diariosRes.data || []).forEach((d) => {
        if (!statsMap.has(d.paciente_id)) {
          statsMap.set(d.paciente_id, { total: 1, ultimaData: d.data });
        } else {
          const s = statsMap.get(d.paciente_id)!;
          s.total += 1;
        }
      });

      const list: PacienteResumo[] = await Promise.all(
        pacsRes.data.map(async (p) => {
          let pacNome = p.nome;
          if (pacNome && pacNome.startsWith("enc:v1:")) {
            pacNome = await decryptClinicalData(pacNome, user.id);
          }
          const stat = statsMap.get(p.id) || { total: 0, ultimaData: null };
          return {
            id: p.id,
            nome: pacNome || "Paciente",
            total: stat.total,
            ultimaData: stat.ultimaData,
          };
        })
      );

      // Ordena por data da última anotação (mais recente no topo)
      list.sort((a, b) => {
        if (a.ultimaData && b.ultimaData) {
          return b.ultimaData.localeCompare(a.ultimaData);
        }
        if (a.ultimaData) return -1;
        if (b.ultimaData) return 1;
        return a.nome.localeCompare(b.nome);
      });

      setPacientes(list);
    } else {
      setPacientes([]);
    }

    setLoadingPacientes(false);
  }, []);

  // 2. Busca anotações do diário de bordo DO PACIENTE SELECIONADO
  const fetchDiariosDoPaciente = useCallback(async (pacId: string, pageNum = 0, isLoadMore = false) => {
    if (isLoadMore) {
      setLoadingMoreDiarios(true);
    } else {
      setLoadingDiarios(true);
      setPage(0);
      setActiveThemeFilter(null);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const from = pageNum * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data } = await supabase
      .from("diario_bordo")
      .select("id, data, conteudo, created_at, paciente_id, agendamento_id")
      .eq("paciente_id", pacId)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data && user) {
      const decrypted = await Promise.all(
        data.map(async (d) => ({
          ...d,
          conteudo: await decryptClinicalData(d.conteudo, user.id),
        }))
      );

      if (isLoadMore) {
        setDiariosPaciente((prev) => [...prev, ...decrypted]);
      } else {
        setDiariosPaciente(decrypted);
      }
      setHasMoreDiarios(data.length === PAGE_SIZE);
    } else {
      if (!isLoadMore) setDiariosPaciente(data || []);
      setHasMoreDiarios(false);
    }

    setLoadingDiarios(false);
    setLoadingMoreDiarios(false);
  }, []);

  function handleLoadMore() {
    if (!selectedPacienteId || loadingMoreDiarios) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchDiariosDoPaciente(selectedPacienteId, nextPage, true);
  }

  useEffect(() => {
    if (!selectedPacienteId) {
      fetchResumoPacientes();
    } else {
      fetchDiariosDoPaciente(selectedPacienteId, 0, false);
    }
  }, [fetchResumoPacientes, fetchDiariosDoPaciente, selectedPacienteId]);

  // Motor de Inteligência Clínica (100% Client-Side - EXCLUSIVO DO PACIENTE SELECIONADO)
  const insights = useMemo(() => {
    return analyzeClinicalEvolutions(diariosPaciente);
  }, [diariosPaciente]);

  // Anotações filtradas por tema no paciente ativo
  const displayedDiarios = useMemo(() => {
    if (!activeThemeFilter) return diariosPaciente;
    const termLower = activeThemeFilter.toLowerCase();
    return diariosPaciente.filter((d) => d.conteudo.toLowerCase().includes(termLower));
  }, [diariosPaciente, activeThemeFilter]);

  // Pacientes filtrados na busca da grade
  const filteredPacientes = pacientes.filter((p) =>
    p.nome.toLowerCase().includes(search.toLowerCase())
  );

  const pacienteSelecionado = pacientes.find((p) => p.id === selectedPacienteId);

  function handleNovaAnotacao() {
    if (isReadOnly) {
      openSubscriptionModal();
      return;
    }
    setEditingDiario(null);
    setPrefillData(selectedPacienteId ? { paciente_id: selectedPacienteId } : undefined);
    setShowModal(true);
  }

  function handleEdit(d: Diario) {
    setEditingDiario(d);
    setPrefillData(undefined);
    setShowModal(true);
  }

  // ─────────────────────────────────────────────────────────────
  // 1. VISÃO MASTER: GRADE DE PACIENTES
  // ─────────────────────────────────────────────────────────────
  if (!selectedPacienteId) {
    return (
      <>
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-serif font-semibold text-text flex items-center gap-2">
              <span>Diário de Bordo & Supervisão</span>
              <span className="text-xs font-sans px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20 flex items-center gap-1 font-normal">
                <ShieldCheck size={12} /> Criptografia AES-256
              </span>
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Selecione um paciente para ver o caderno clínico completo, hipóteses de manejo e anotações para supervisão.
            </p>
          </div>
          <button
            onClick={handleNovaAnotacao}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                       bg-primary text-white text-sm font-medium
                       hover:bg-primary-dark active:scale-[0.98]
                       transition-all duration-200 cursor-pointer shrink-0 shadow-xs"
          >
            <Plus size={18} />
            Nova Anotação
          </button>
        </div>

        {/* Search Bar */}
        <div className="bg-surface rounded-2xl border border-border shadow-xs p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted/60" size={16} />
            <input
              type="text"
              placeholder="Buscar paciente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background/50 border border-border/80 text-text text-sm
                         placeholder:text-text-muted/50 focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
        </div>

        {/* Patient Grid */}
        <div className="bg-surface rounded-2xl border border-border shadow-xs overflow-hidden">
          {loadingPacientes ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <Loader2 className="animate-spin mb-3 text-primary" size={24} />
              <p className="text-sm">Carregando pacientes…</p>
            </div>
          ) : filteredPacientes.length === 0 ? (
            <div className="p-12 text-center">
              <BookOpen className="mx-auto text-text-muted/30 mb-3" size={40} />
              <h3 className="text-base font-serif font-medium text-text mb-1">
                {search ? "Nenhum paciente encontrado" : "Nenhum paciente cadastrado"}
              </h3>
              <p className="text-sm text-text-muted max-w-sm mx-auto mb-6">
                {search
                  ? "Tente buscar com outro nome."
                  : "Cadastre pacientes para registrar hipóteses clínicas, anotações de supervisão e contratransferências."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 p-4 gap-4">
              {filteredPacientes.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPacienteId(p.id)}
                  className="flex flex-col items-start p-5 rounded-xl border border-border/40 bg-background/30
                             hover:bg-primary/5 hover:border-primary/30 transition-all text-left cursor-pointer group"
                >
                  <h4 className="text-base font-medium text-text group-hover:text-primary transition-colors sensitive-data">
                    {p.nome}
                  </h4>
                  <div className="flex items-center gap-4 mt-3 text-xs text-text-muted">
                    <span className="flex items-center gap-1.5">
                      <FileText size={14} />
                      {p.total} {p.total === 1 ? "anotação" : "anotações"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar size={14} />
                      Última: {p.ultimaData ? new Date(p.ultimaData + "T12:00:00").toLocaleDateString("pt-BR") : "--/--/----"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {showModal && (
          <DiarioFormModal
            diario={editingDiario}
            prefillData={prefillData}
            onClose={() => setShowModal(false)}
            onSaved={() => {
              setShowModal(false);
              fetchResumoPacientes();
            }}
          />
        )}
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 2. VISÃO DETAIL: CADERNO CLÍNICO DO PACIENTE SELECIONADO
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto pb-20">
      {/* Barra de Ações Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <button
          onClick={() => setSelectedPacienteId(null)}
          className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text transition-colors cursor-pointer w-fit"
        >
          <ArrowLeft size={16} />
          Voltar para lista de pacientes
        </button>

        <button
          onClick={handleNovaAnotacao}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl
                     bg-primary text-white text-sm font-medium
                     hover:bg-primary-dark transition-all cursor-pointer shadow-xs"
        >
          <Plus size={16} />
          Adicionar Anotação
        </button>
      </div>

      {/* Cabeçalho do Caderno Clínico do Paciente */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 md:p-8 mb-6">
        <div className="border-b border-primary/20 pb-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs text-primary font-bold uppercase tracking-wider">
                Caderno Clínico & Estudo de Caso
              </span>
              <h1 className="text-2xl font-serif text-text font-bold mt-1 sensitive-data">
                {pacienteSelecionado?.nome || "Paciente"}
              </h1>
            </div>
            <span className="text-xs font-sans px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/20 flex items-center gap-1 font-normal w-fit">
              <ShieldCheck size={12} /> Sigilo Estrito
            </span>
          </div>
          <p className="text-xs text-text-muted mt-2">
            Espaço confidencial para hipóteses, contratransferência e reflexões clínicas exclusivas deste paciente.
          </p>
        </div>

        {/* ─── RADAR DE TEMAS & ESTUDO DE CASO (EXCLUSIVO DESTE PACIENTE) ─── */}
        {diariosPaciente.length > 0 && insights.topKeywords.length > 0 && (
          <div className="mb-6 rounded-2xl bg-background/50 border border-primary/20 shadow-2xs overflow-hidden transition-all">
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
                      Radar de Temas & Palavras-Chave
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary">
                      {insights.topKeywords.length} tópicos identificados neste paciente
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Mapeamento semântico de queixas, afetos e figuras centrais mencionadas no caso de {pacienteSelecionado?.nome?.split(" ")[0] || "deste paciente"}.
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
                  <span>Análise semântica processada 100% na memória do seu navegador com sigilo absoluto.</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Linha do Tempo das Anotações do Diário do Paciente */}
        {loadingDiarios ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <Loader2 className="animate-spin mb-3 text-primary" size={24} />
            <p className="text-sm">Carregando anotações clínicas…</p>
          </div>
        ) : displayedDiarios.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-border/60 rounded-xl">
            <BookOpen className="mx-auto text-text-muted/30 mb-3" size={36} />
            <h3 className="text-base font-serif font-medium text-text mb-1">
              {activeThemeFilter
                ? `Nenhuma anotação com o tema #${activeThemeFilter}`
                : "Nenhuma reflexão registrada ainda"}
            </h3>
            <p className="text-xs text-text-muted max-w-sm mx-auto mb-4">
              {activeThemeFilter
                ? "Tente selecionar outra palavra-chave no radar acima."
                : "Clique em 'Adicionar Anotação' para registrar impressões, contratransferências e notas para supervisão deste paciente."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {displayedDiarios.map((d, index) => {
              const dataFormatada = d.data
                ? new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })
                : "Data não informada";

              return (
                <div
                  key={d.id}
                  className="p-5 rounded-2xl bg-background/50 border border-border/60 hover:border-primary/30 transition-all space-y-3 relative group"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-primary" />
                      <h4 className="text-sm font-bold text-text capitalize">
                        {dataFormatada}
                      </h4>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleEdit(d)}
                      className="p-1.5 rounded-lg text-text-muted/50 hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer"
                      title="Editar anotação"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>

                  <div className="prose prose-sm max-w-none text-text">
                    <p className="font-serif text-sm text-text-muted/90 leading-relaxed whitespace-pre-wrap text-justify sensitive-data">
                      {d.conteudo}
                    </p>
                  </div>
                </div>
              );
            })}

            {hasMoreDiarios && !activeThemeFilter && (
              <div className="pt-4 text-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMoreDiarios}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface border border-border text-xs font-semibold text-text hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {loadingMoreDiarios ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-primary" />
                      <span>Carregando anotações anteriores...</span>
                    </>
                  ) : (
                    <span>Carregar anotações anteriores</span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <DiarioFormModal
          diario={editingDiario}
          prefillData={prefillData}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            if (selectedPacienteId) {
              fetchDiariosDoPaciente(selectedPacienteId, 0, false);
            } else {
              fetchResumoPacientes();
            }
          }}
        />
      )}
    </div>
  );
}

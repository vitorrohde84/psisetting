"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Search, Plus, FileText, Pencil, Calendar, Clock, Loader2, ArrowLeft, Printer, Users } from "lucide-react";
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

interface PacienteResumo {
  id: string;
  nome: string;
  total: number;
  ultimaData: string;
}

export function ProntuarioList() {
  const supabase = createClient();
  
  // Lista de Pacientes
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [loadingPacientes, setLoadingPacientes] = useState(true);
  const [search, setSearch] = useState("");

  // Visão do Paciente (Prontuário Único)
  const [selectedPacienteId, setSelectedPacienteId] = useState<string | null>(null);
  const [prontuariosPaciente, setProntuariosPaciente] = useState<Prontuario[]>([]);
  const [loadingProntuarios, setLoadingProntuarios] = useState(false);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingProntuario, setEditingProntuario] = useState<Prontuario | null>(null);
  const [prefillData, setPrefillData] = useState<{ paciente_id: string } | undefined>(undefined);

  const fetchResumoPacientes = useCallback(async () => {
    setLoadingPacientes(true);

    const { data: pronts } = await supabase
      .from("prontuarios")
      .select("id, paciente_id, data, pacientes(nome)")
      .order("data", { ascending: false });
    
    if (pronts) {
      const map = new Map<string, PacienteResumo>();
      pronts.forEach((p) => {
        if (!map.has(p.paciente_id)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pacs = p.pacientes as any;
          const pacNome = Array.isArray(pacs) ? pacs[0]?.nome : pacs?.nome;
          map.set(p.paciente_id, {
            id: p.paciente_id,
            nome: pacNome || "Desconhecido",
            total: 0,
            ultimaData: p.data,
          });
        }
        const item = map.get(p.paciente_id)!;
        item.total += 1;
      });
      setPacientes(Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome)));
    } else {
      setPacientes([]);
    }
    
    setLoadingPacientes(false);
  }, []);

  const fetchProntuariosDoPaciente = useCallback(async (pacienteId: string) => {
    setLoadingProntuarios(true);
    const { data } = await supabase
      .from("prontuarios")
      .select("id, data, conteudo, created_at, paciente_id, agendamento_id, agendamentos(horario)")
      .eq("paciente_id", pacienteId)
      .order("data", { ascending: true }) // Cronológico: mais antigo primeiro (ideal para prontuário único)
      .order("created_at", { ascending: true });
    
    setProntuariosPaciente(data || []);
    setLoadingProntuarios(false);
  }, []);

  useEffect(() => {
    if (!selectedPacienteId) {
      fetchResumoPacientes();
    } else {
      fetchProntuariosDoPaciente(selectedPacienteId);
    }
  }, [fetchResumoPacientes, fetchProntuariosDoPaciente, selectedPacienteId]);

  function handleNovaEvolucao() {
    setEditingProntuario(null);
    setPrefillData(selectedPacienteId ? { paciente_id: selectedPacienteId } : undefined);
    setShowModal(true);
  }

  function handleEdit(p: Prontuario) {
    setEditingProntuario(p);
    setPrefillData(undefined);
    setShowModal(true);
  }

  function handlePrint() {
    window.print();
  }

  function getAgendamentoHorario(p: Prontuario): string | null {
    const ag = p.agendamentos;
    if (!ag) return null;
    let horario;
    if (Array.isArray(ag)) horario = ag[0]?.horario;
    else horario = ag.horario;
    return horario ? horario.slice(0, 5) : null;
  }

  const filteredPacientes = pacientes.filter(p => p.nome.toLowerCase().includes(search.toLowerCase()));
  
  const pacienteSelecionado = pacientes.find(p => p.id === selectedPacienteId);

  // --- VISÃO DE LISTA DE PACIENTES ---
  if (!selectedPacienteId) {
    return (
      <>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-serif font-semibold text-text">Prontuários</h2>
            <p className="mt-0.5 text-sm text-text-muted">
              Selecione um paciente para ver o prontuário completo
            </p>
          </div>
          <button
            onClick={handleNovaEvolucao}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                       bg-primary text-white text-sm font-medium
                       hover:bg-primary-dark active:scale-[0.98]
                       transition-all duration-200 cursor-pointer shrink-0"
          >
            <Plus size={18} />
            Novo Prontuário
          </button>
        </div>

        <div className="bg-surface rounded-xl border border-border/60 p-4 mb-6 flex items-center">
          <Search className="text-text-muted/50 ml-3 mr-2 shrink-0" size={18} />
          <input
            type="text"
            placeholder="Buscar paciente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full py-2 bg-transparent text-text text-sm focus:outline-none"
          />
        </div>

        <div className="bg-surface rounded-xl border border-border/60 overflow-hidden min-h-[400px]">
          {loadingPacientes ? (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2 size={28} className="animate-spin text-primary mb-3" />
              <p className="text-sm text-text-muted">Carregando pacientes...</p>
            </div>
          ) : filteredPacientes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center px-4">
              <Users size={36} className="text-border mb-3" />
              <h3 className="text-base font-medium text-text mb-1">Nenhum prontuário encontrado</h3>
              <p className="text-sm text-text-muted">
                {search ? "Nenhum paciente corresponde à busca." : "Você ainda não registrou nenhuma evolução clínica."}
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
                      {p.total} {p.total === 1 ? 'sessão' : 'sessões'}
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
          <ProntuarioFormModal
            prontuario={editingProntuario}
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

  // --- VISÃO DE DOCUMENTO ÚNICO DO PACIENTE ---
  return (
    <div className="max-w-4xl mx-auto pb-20">
      {/* Barra de Ações (Oculta na impressão) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <button
          onClick={() => setSelectedPacienteId(null)}
          className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text transition-colors cursor-pointer w-fit"
        >
          <ArrowLeft size={16} />
          Voltar para lista
        </button>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl
                       bg-surface border border-border text-text-muted text-sm font-medium
                       hover:text-text hover:border-primary/40 transition-colors cursor-pointer"
          >
            <Printer size={16} />
            Exportar PDF
          </button>
          <button
            onClick={handleNovaEvolucao}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl
                       bg-primary text-white text-sm font-medium
                       hover:bg-primary-dark transition-colors cursor-pointer"
          >
            <Plus size={16} />
            Adicionar Evolução
          </button>
        </div>
      </div>

      {/* Documento do Prontuário */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 md:p-12 print:border-none print:shadow-none print:p-0">
        
        {/* Cabeçalho do Documento */}
        <div className="text-center border-b-2 border-primary/20 pb-8 mb-8">
          <h1 className="text-2xl md:text-3xl font-serif text-text font-bold tracking-tight">Prontuário Psicológico</h1>
          <h2 className="text-lg md:text-xl font-medium text-primary-dark mt-2 uppercase tracking-wide sensitive-data">
            {pacienteSelecionado?.nome || "Paciente"}
          </h2>
          <p className="text-xs text-text-muted mt-3 uppercase tracking-widest font-semibold">
            Documento Confidencial
          </p>
        </div>

        {/* Conteúdo */}
        {loadingProntuarios ? (
          <div className="flex flex-col items-center justify-center py-20 no-print">
            <Loader2 size={32} className="animate-spin text-primary mb-4" />
            <p className="text-sm text-text-muted">Carregando prontuário...</p>
          </div>
        ) : prontuariosPaciente.length === 0 ? (
          <div className="text-center py-20 no-print">
            <p className="text-text-muted">Nenhuma evolução registrada para esta paciente.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {prontuariosPaciente.map((p, index) => {
              const dataSessao = p.data
                ? new Date(p.data + "T12:00:00").toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    year: "numeric"
                  })
                : "Data não informada";
              const horarioSessao = getAgendamentoHorario(p);

              return (
                <div key={p.id} className="relative group">
                  {/* Divisória visual leve (oculta no print para ficar mais limpo, se desejar) */}
                  {index !== 0 && <div className="absolute -top-5 left-0 right-0 h-px bg-border/40 print:bg-border/60" />}
                  
                  <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-3">
                    <h3 className="text-base font-semibold text-text flex items-center gap-2 capitalize">
                      Sessão: {dataSessao}
                    </h3>
                    
                    <div className="flex items-center gap-3">
                      {horarioSessao && (
                        <span className="text-xs text-text-muted flex items-center gap-1">
                          <Clock size={12} /> {horarioSessao}
                        </span>
                      )}
                      {/* Botão de editar: oculto na impressão */}
                      <button
                        onClick={() => handleEdit(p)}
                        className="no-print p-1.5 rounded-lg text-text-muted/40 hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Editar evolução"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="prose prose-sm max-w-none text-text">
                    <p className="font-serif leading-relaxed whitespace-pre-wrap text-justify">
                      {p.conteudo}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        <div className="mt-16 pt-8 border-t border-border/40 text-center print:block">
          <p className="text-xs text-text-muted/60">
            Documento gerado em {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR")}
          </p>
        </div>
      </div>

      {showModal && (
        <ProntuarioFormModal
          prontuario={editingProntuario}
          prefillData={prefillData}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchProntuariosDoPaciente(selectedPacienteId);
          }}
        />
      )}
    </div>
  );
}

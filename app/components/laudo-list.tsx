"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Search, Plus, Filter, FileText, Download, Printer, Loader2, FolderOpen } from "lucide-react";
import { LaudoFormModal } from "./laudo-form-modal";
import { LaudoPrint } from "./laudo-print";
import { getLaudoSignedUrl } from "@/utils/supabase/storage";

interface Laudo {
  id: string;
  paciente_id: string;
  titulo: string;
  tipo_documento: "upload" | "text";
  conteudo: string; // File path or Text content
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pacientes?: any;
}

interface PacienteOption {
  id: string;
  nome: string;
}

export function LaudoList() {
  const supabase = createClient();
  const [laudos, setLaudos] = useState<Laudo[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState("");
  const [pacienteFilter, setPacienteFilter] = useState<string>("all");
  const [pacientesOptions, setPacientesOptions] = useState<PacienteOption[]>([]);

  // Modal
  const [showModal, setShowModal] = useState(false);

  // Printing state
  const [printingLaudo, setPrintingLaudo] = useState<Laudo | null>(null);
  
  // Loading URLs state
  const [openingUrls, setOpeningUrls] = useState<Record<string, boolean>>({});

  const fetchLaudos = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("laudos")
      .select("id, titulo, tipo_documento, conteudo, created_at, paciente_id, pacientes(nome, cpf, data_nascimento)")
      .order("created_at", { ascending: false });

    if (pacienteFilter !== "all") {
      query = query.eq("paciente_id", pacienteFilter);
    }
    if (search) {
      query = query.ilike("titulo", `%${search}%`);
    }

    const { data } = await query;
    setLaudos(data || []);
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
      fetchLaudos();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchLaudos, search, pacienteFilter]);

  function getPacienteInfo(l: Laudo) {
    const pac = l.pacientes;
    if (!pac) return { nome: "Desconhecido", cpf: "", data_nascimento: "" };
    if (Array.isArray(pac)) return pac[0] || {};
    return pac || {};
  }

  async function handleOpenPdf(laudo: Laudo) {
    if (laudo.tipo_documento !== "upload") return;
    
    setOpeningUrls((prev) => ({ ...prev, [laudo.id]: true }));
    
    // The "conteudo" field holds the Supabase Storage filePath for uploaded PDFs
    const { signedUrl, error } = await getLaudoSignedUrl(laudo.conteudo);
    
    setOpeningUrls((prev) => ({ ...prev, [laudo.id]: false }));

    if (error || !signedUrl) {
      alert("Não foi possível gerar o link seguro para este arquivo.");
      return;
    }

    // Open signed URL in new tab
    window.open(signedUrl, "_blank", "noopener,noreferrer");
  }

  function handlePrint(laudo: Laudo) {
    if (laudo.tipo_documento !== "text") return;
    setPrintingLaudo(laudo);
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-serif font-semibold text-text">Laudos e Documentos</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Gestão de declarações, atestados e uploads de arquivos PDF
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                     bg-primary text-white text-sm font-medium
                     hover:bg-primary-dark active:scale-[0.98]
                     transition-all duration-200 cursor-pointer shrink-0"
        >
          <Plus size={18} />
          Novo Documento
        </button>
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-xl border border-border/60 p-4 mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/50" size={16} />
          <input
            type="text"
            placeholder="Buscar por título..."
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

      {/* List */}
      <div className="bg-surface rounded-xl border border-border/60 overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Loader2 size={28} className="animate-spin text-primary mb-3" />
            <p className="text-sm text-text-muted">Carregando documentos...</p>
          </div>
        ) : laudos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-4">
            <FolderOpen size={36} className="text-border mb-3" />
            <h3 className="text-base font-medium text-text mb-1">Nenhum documento encontrado</h3>
            <p className="text-sm text-text-muted">
              {search || pacienteFilter !== "all"
                ? "Nenhum laudo corresponde aos filtros."
                : "Você ainda não emitiu ou anexou nenhum laudo."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {laudos.map((laudo) => {
              const dataCriacao = new Date(laudo.created_at).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
                year: "numeric"
              });
              const pacInfo = getPacienteInfo(laudo);

              return (
                <div key={laudo.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-background/30 transition-colors">
                  
                  {/* Info */}
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <FileText size={20} />
                    </div>
                    <div>
                      <h4 className="text-base font-medium text-text">{laudo.titulo}</h4>
                      <p className="text-sm text-text-muted mt-0.5">
                        Paciente: <span className="font-medium text-text">{pacInfo.nome || "Desconhecido"}</span>
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-text-muted/80 font-medium">
                        <span className="capitalize">{dataCriacao}</span>
                        <span>&bull;</span>
                        <span className="px-1.5 py-0.5 rounded bg-background border border-border">
                          {laudo.tipo_documento === "upload" ? "Arquivo PDF" : "Texto Gerado"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 sm:ml-auto">
                    {laudo.tipo_documento === "upload" ? (
                      <button
                        onClick={() => handleOpenPdf(laudo)}
                        disabled={openingUrls[laudo.id]}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                                   bg-background border border-border text-text hover:bg-surface hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {openingUrls[laudo.id] ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Download size={16} />
                        )}
                        Visualizar PDF
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePrint(laudo)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                                   bg-background border border-border text-text hover:bg-surface hover:text-primary transition-colors cursor-pointer"
                      >
                        <Printer size={16} />
                        Imprimir Laudo
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <LaudoFormModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchLaudos();
          }}
        />
      )}

      {/* Hidden Print Container (renders on top of everything when printingLaudo is set) */}
      {printingLaudo && (
        <LaudoPrint
          titulo={printingLaudo.titulo}
          conteudo={printingLaudo.conteudo}
          pacienteNome={getPacienteInfo(printingLaudo).nome}
          pacienteCpf={getPacienteInfo(printingLaudo).cpf}
          pacienteNascimento={getPacienteInfo(printingLaudo).data_nascimento}
          onPrinted={() => setPrintingLaudo(null)}
        />
      )}
    </>
  );
}

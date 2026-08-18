"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, Save, Loader2, Search, FileUp, FileText } from "lucide-react";
import { uploadLaudoPdf } from "@/utils/supabase/storage";
import { encryptClinicalData } from "@/utils/crypto";

interface PacienteOption {
  id: string;
  nome: string;
  cpf?: string;
  data_nascimento?: string;
}

interface LaudoFormModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export function LaudoFormModal({ onClose, onSaved }: LaudoFormModalProps) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mode: 'upload' or 'text'
  const [mode, setMode] = useState<"upload" | "text">("text");

  // Form State
  const [pacienteId, setPacienteId] = useState("");
  const [titulo, setTitulo] = useState("Laudo Psicológico");
  const [conteudoText, setConteudoText] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // Patients Search
  const [pacientes, setPacientes] = useState<PacienteOption[]>([]);
  const [pacienteSearch, setPacienteSearch] = useState("");
  const [showPacienteDropdown, setShowPacienteDropdown] = useState(false);
  const [selectedPacienteName, setSelectedPacienteName] = useState("");

  useEffect(() => {
    async function fetchPacientes() {
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome, cpf, data_nascimento")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      
      setPacientes(data || []);
    }
    fetchPacientes();
  }, []);

  const filteredPacientes = pacienteSearch
    ? pacientes.filter((p) =>
        p.nome.toLowerCase().includes(pacienteSearch.toLowerCase())
      )
    : pacientes;

  function selectPaciente(p: PacienteOption) {
    setPacienteId(p.id);
    setSelectedPacienteName(p.nome);
    setPacienteSearch("");
    setShowPacienteDropdown(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!pacienteId) {
      setError("Selecione um paciente.");
      return;
    }
    if (!titulo.trim()) {
      setError("Informe um título para o documento.");
      return;
    }

    if (mode === "upload" && !file) {
      setError("Anexe um arquivo PDF.");
      return;
    }
    if (mode === "text" && !conteudoText.trim()) {
      setError("O conteúdo do laudo não pode estar vazio.");
      return;
    }

    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Sessão expirada.");
      setSaving(false);
      return;
    }

    try {
      let finalConteudo = "";

      // Handle Upload vs Text
      if (mode === "upload" && file) {
        const { path, error: uploadErr } = await uploadLaudoPdf(file, pacienteId);
        if (uploadErr || !path) {
          throw new Error(uploadErr || "Erro ao fazer upload do arquivo.");
        }
        finalConteudo = path; // Save the storage path in the DB
      } else {
        finalConteudo = await encryptClinicalData(conteudoText.trim(), user.id);
      }

      // Save to DB
      const { error: dbError } = await supabase
        .from("laudos")
        .insert({
          paciente_id: pacienteId,
          psicologo_id: user.id,
          titulo: titulo.trim(),
          tipo_documento: mode,
          conteudo: finalConteudo,
        });

      if (dbError) throw dbError;

      onSaved();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro inesperado ao salvar o laudo.");
      setSaving(false);
    }
  }

  const inputClass =
    "w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-text text-sm " +
    "placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 " +
    "focus:border-primary/40 transition-all";
  const labelClass = "block text-sm font-medium text-text-muted mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-text/20 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col bg-surface rounded-2xl shadow-xl border border-border/60">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 shrink-0">
          <div>
            <h3 className="text-lg font-serif font-medium text-text">Novo Documento</h3>
            <p className="text-xs text-text-muted mt-0.5">Laudos, Atestados e Declarações</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-background transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs for Mode Selection */}
        <div className="flex border-b border-border/40 bg-background/30 px-6 pt-3 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMode("text")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              mode === "text"
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-text hover:bg-black/5"
            } rounded-t-lg`}
          >
            <FileText size={16} />
            Redigir Documento
          </button>
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              mode === "upload"
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-text hover:bg-black/5"
            } rounded-t-lg`}
          >
            <FileUp size={16} />
            Anexar PDF Assinado
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Paciente Selection */}
            <div className="relative">
              <label className={labelClass}>
                Paciente <span className="text-danger">*</span>
              </label>
              {selectedPacienteName && !showPacienteDropdown ? (
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-background border border-border">
                  <span className="text-sm text-text">{selectedPacienteName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPacienteName("");
                      setPacienteId("");
                      setShowPacienteDropdown(true);
                    }}
                    className="text-text-muted hover:text-text transition-colors cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/50" size={16} />
                    <input
                      type="text"
                      placeholder="Buscar paciente..."
                      value={pacienteSearch}
                      onChange={(e) => {
                        setPacienteSearch(e.target.value);
                        setShowPacienteDropdown(true);
                      }}
                      onFocus={() => setShowPacienteDropdown(true)}
                      className={inputClass + " pl-9"}
                    />
                  </div>
                  {showPacienteDropdown && (
                    <div className="absolute z-20 w-full mt-1 max-h-48 overflow-y-auto bg-surface rounded-xl border border-border shadow-lg">
                      {filteredPacientes.length === 0 ? (
                        <p className="px-3.5 py-3 text-sm text-text-muted">Nenhum paciente encontrado</p>
                      ) : (
                        filteredPacientes.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => selectPaciente(p)}
                            className="w-full text-left px-3.5 py-2.5 text-sm text-text hover:bg-background transition-colors cursor-pointer"
                          >
                            {p.nome}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Titulo */}
            <div>
              <label className={labelClass}>
                Título do Documento <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Laudo Psicológico, Atestado de Comparecimento..."
                className={inputClass}
              />
            </div>
          </div>

          {mode === "text" ? (
            <div>
              <label className={labelClass}>
                Conteúdo <span className="text-danger">*</span>
              </label>
              <p className="text-[11px] text-text-muted mb-2">
                O cabeçalho e assinatura com seu CRP serão adicionados automaticamente ao gerar o PDF.
              </p>
              <textarea
                required={mode === "text"}
                rows={12}
                value={conteudoText}
                onChange={(e) => setConteudoText(e.target.value)}
                placeholder="Redija o conteúdo do documento aqui..."
                className={inputClass + " font-serif text-base leading-relaxed resize-none"}
              />
            </div>
          ) : (
            <div className="pt-2">
              <label className={labelClass}>
                Arquivo PDF <span className="text-danger">*</span>
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-border border-dashed rounded-xl hover:bg-background/50 transition-colors">
                <div className="space-y-1 text-center">
                  <FileUp className="mx-auto h-12 w-12 text-text-muted/50" />
                  <div className="flex text-sm text-text-muted justify-center">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-md bg-transparent font-medium text-primary hover:text-primary-dark focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2"
                    >
                      <span>Faça upload de um arquivo</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        accept="application/pdf"
                        className="sr-only"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setFile(e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-text-muted/70">Apenas arquivos PDF (Máx. 10MB)</p>
                  {file && (
                    <div className="mt-4 p-2 bg-primary/10 rounded border border-primary/20 flex items-center justify-center gap-2">
                      <FileText size={14} className="text-primary" />
                      <span className="text-sm font-medium text-primary truncate max-wxs">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setFile(null)}
                        className="text-primary hover:text-danger cursor-pointer ml-2"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-danger/5 border border-danger/15 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-text-muted
                         hover:bg-background transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                         bg-primary text-white text-sm font-medium
                         hover:bg-primary-dark active:scale-[0.98]
                         disabled:opacity-60 disabled:cursor-not-allowed
                         transition-all duration-200 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Salvando…
                </>
              ) : (
                <>
                  <Save size={16} />
                  Salvar Documento
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

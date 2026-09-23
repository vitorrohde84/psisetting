"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, Save, Loader2, Search, FileUp, FileText, Sparkles, Check, AlertCircle } from "lucide-react";
import { uploadLaudoPdf } from "@/utils/supabase/storage";
import { encryptClinicalData, decryptClinicalData } from "@/utils/crypto";
import { CFP_TEMPLATES, LaudoTemplate } from "@/utils/laudo-templates";
import { camposFaltando, juntarRotulos, texto, type CampoFaltando } from "@/utils/dados-profissionais";
import { marcadoresPendentes, resumirMarcadores } from "@/utils/marcadores-documento";
import { LaudoConfigModal } from "./laudo-config-modal";

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

// Nome e CRP vão para o texto dos modelos; `faltando` diz o que impede a
// impressão. Campo vazio fica undefined para o modelo usar os próprios
// marcadores ([Nome da Psicóloga], [Registro CRP]) em vez de um texto genérico
// que passaria despercebido na revisão.
interface PerfilDocumento {
  nome?: string;
  crp?: string;
  faltando: CampoFaltando[];
}

// "Revisar documento" devolve a pessoa ao texto já no primeiro campo em
// aberto, selecionado — é o que ela vai querer preencher.
function focarPrimeiroMarcador(campo: HTMLTextAreaElement | null) {
  if (!campo) return;
  const primeiro = marcadoresPendentes(campo.value)[0];
  if (primeiro) {
    const inicio = campo.value.indexOf(primeiro);
    campo.setSelectionRange(inicio, inicio + primeiro.length);
  }
  campo.focus();
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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [psicologoProfile, setPsicologoProfile] = useState<PerfilDocumento | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  // Último texto que um modelo montou. Se o conteúdo ainda é esse (ninguém
  // editou), dá para remontar com os dados profissionais recém-salvos.
  const textoDoModelo = useRef<string | null>(null);

  // Termo de responsabilidade: abre a cada "Salvar Documento" no modo redigido.
  const [termoAberto, setTermoAberto] = useState(false);
  const termoRef = useRef<HTMLDivElement>(null);
  const revisarRef = useRef<HTMLButtonElement>(null);
  const conteudoRef = useRef<HTMLTextAreaElement>(null);

  // Patients Search
  const [pacientes, setPacientes] = useState<PacienteOption[]>([]);
  const [pacienteSearch, setPacienteSearch] = useState("");
  const [showPacienteDropdown, setShowPacienteDropdown] = useState(false);
  const [selectedPacienteName, setSelectedPacienteName] = useState("");

  async function carregarPerfil(userId: string): Promise<PerfilDocumento | null> {
    const { data: prof } = await supabase
      .from("profiles")
      .select("nome, nome_completo, crp, cidade")
      .eq("id", userId)
      .single();
    if (!prof) return null;
    const perfil: PerfilDocumento = {
      nome: texto(prof.nome_completo) || texto(prof.nome) || undefined,
      crp: texto(prof.crp) || undefined,
      faltando: camposFaltando(prof),
    };
    setPsicologoProfile(perfil);
    return perfil;
  }

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch psychologist profile
      await carregarPerfil(user.id);

      // Fetch patients
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome, cpf, data_nascimento")
        .eq("ativo", true);
      
      let list: PacienteOption[] = [];
      if (data) {
        list = await Promise.all(
          data.map(async (p) => ({
            id: p.id,
            nome: await decryptClinicalData(p.nome, user.id),
            cpf: await decryptClinicalData(p.cpf, user.id),
            data_nascimento: p.data_nascimento,
          }))
        );
        list.sort((a, b) => a.nome.localeCompare(b.nome));
      }
      setPacientes(list);
    }
    fetchData();
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

    if (selectedTemplateId) {
      const tmpl = CFP_TEMPLATES.find((t) => t.id === selectedTemplateId);
      if (tmpl) {
        const content = tmpl.buildConteudo({
          pacienteNome: p.nome,
          pacienteCpf: p.cpf,
          psicologoNome: psicologoProfile?.nome,
          psicologoCrp: psicologoProfile?.crp,
        });
        setConteudoText(content);
        textoDoModelo.current = content;
      }
    }
  }

  function applyTemplate(tmpl: LaudoTemplate) {
    setSelectedTemplateId(tmpl.id);
    setTitulo(tmpl.titulo);

    const selectedPac = pacientes.find((p) => p.id === pacienteId);
    const content = tmpl.buildConteudo({
      pacienteNome: selectedPac?.nome,
      pacienteCpf: selectedPac?.cpf,
      psicologoNome: psicologoProfile?.nome,
      psicologoCrp: psicologoProfile?.crp,
    });
    setConteudoText(content);
    textoDoModelo.current = content;
    setMode("text");
  }

  // Depois de preencher os dados pelo aviso: o modelo foi montado com os
  // marcadores no lugar do nome e do CRP. Se o texto ainda é o que o modelo
  // gerou, remonta com os dados novos; texto já editado fica como está — não
  // se apaga o que a pessoa escreveu.
  async function aoSalvarDadosProfissionais() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const perfil = await carregarPerfil(user.id);
    if (!perfil || !selectedTemplateId || conteudoText !== textoDoModelo.current) return;

    const tmpl = CFP_TEMPLATES.find((t) => t.id === selectedTemplateId);
    if (!tmpl) return;
    const selectedPac = pacientes.find((p) => p.id === pacienteId);
    const content = tmpl.buildConteudo({
      pacienteNome: selectedPac?.nome,
      pacienteCpf: selectedPac?.cpf,
      psicologoNome: perfil.nome,
      psicologoCrp: perfil.crp,
    });
    setConteudoText(content);
    textoDoModelo.current = content;
  }

  // O aviso aparece só depois que um modelo foi aplicado: é quando o texto já
  // depende desses dados. O rascunho continua podendo ser salvo — quem barra é
  // a impressão, na lista de documentos.
  const avisoDadosFaltando =
    mode === "text" && selectedTemplateId !== null && psicologoProfile && psicologoProfile.faltando.length > 0
      ? psicologoProfile.faltando
      : null;

  // Foco no botão que não compromete ("Revisar documento"): um Enter distraído
  // não aceita a responsabilidade. Esc revisa; Tab circula só dentro do termo.
  useEffect(() => {
    if (!termoAberto) return;
    revisarRef.current?.focus();

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setTermoAberto(false);
        focarPrimeiroMarcador(conteudoRef.current);
        return;
      }
      if (e.key !== "Tab" || !termoRef.current) return;
      const botoes = termoRef.current.querySelectorAll<HTMLButtonElement>("button");
      const primeiro = botoes[0];
      const ultimo = botoes[botoes.length - 1];
      if (!termoRef.current.contains(document.activeElement)) {
        e.preventDefault();
        primeiro.focus();
      } else if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [termoAberto]);

  // Validações primeiro: faltando paciente, título ou conteúdo, mostra o erro
  // de sempre e o termo nem abre. Documento redigido passa pelo termo a cada
  // salvamento; PDF anexado não — chega pronto e assinado, sem modelo do
  // sistema, e segue direto para o upload.
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

    if (mode === "text") {
      setTermoAberto(true);
      return;
    }
    await salvarDocumento();
  }

  function revisarDocumento() {
    setTermoAberto(false);
    focarPrimeiroMarcador(conteudoRef.current);
  }

  // O aceite não é gravado: o termo é um lembrete na hora de emitir.
  async function aceitarTermo() {
    setTermoAberto(false);
    await salvarDocumento();
  }

  async function salvarDocumento() {
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
            <div className="space-y-4">
              {/* Seletor de 5 Modelos conforme a Resolução CFP nº 06/2019 */}
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} /> 5 Modelos conforme a Resolução CFP nº 06/2019
                  </span>
                  <span className="text-[11px] text-text-muted">
                    Clique em um modelo para carregar a estrutura recomendada
                  </span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {CFP_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => applyTemplate(tmpl)}
                      className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                        selectedTemplateId === tmpl.id
                          ? "bg-primary text-white border-primary shadow-sm"
                          : "bg-surface hover:bg-background border-border text-text hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-semibold text-xs truncate">{tmpl.label}</span>
                        {selectedTemplateId === tmpl.id && <Check size={13} className="shrink-0" />}
                      </div>
                      <p className={`text-[10.5px] line-clamp-2 ${selectedTemplateId === tmpl.id ? "text-white/80" : "text-text-muted"}`}>
                        {tmpl.descricao}
                      </p>
                    </button>
                  ))}
                </div>

                {/* Disclaimer Ético */}
                <div className="mt-3 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-[11px] text-amber-950 flex items-start gap-2">
                  <AlertCircle size={14} className="text-amber-800 shrink-0 mt-0.5" />
                  <span>
                    <strong>Aviso Ético:</strong> Os modelos disponibilizados são ferramentas de apoio estruturadas com base na Resolução CFP nº 06/2019. A revisão, adequação e utilização do documento são de responsabilidade do profissional, conforme seu conhecimento técnico e as normas vigentes.
                  </span>
                </div>
              </div>

              {avisoDadosFaltando && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs sm:text-[13px] text-amber-950 flex items-start gap-2"
                >
                  <AlertCircle size={15} className="text-amber-800 shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <p>
                      <strong>Faltam seus dados profissionais:</strong> {juntarRotulos(avisoDadosFaltando)}.
                      O texto do modelo sai com esses campos em branco (entre colchetes) e o
                      documento só poderá ser impresso depois que você preenchê-los. O rascunho
                      pode ser salvo normalmente.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowConfigModal(true)}
                      className="font-semibold underline underline-offset-2 hover:text-amber-800 cursor-pointer"
                    >
                      Preencher agora
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className={labelClass}>
                  Conteúdo do Documento <span className="text-danger">*</span>
                </label>
                <p className="text-[11px] text-text-muted mb-2">
                  O cabeçalho, dados do paciente e sua assinatura com CRP serão formatados automaticamente na impressão.
                </p>
                <textarea
                  ref={conteudoRef}
                  required={mode === "text"}
                  rows={13}
                  value={conteudoText}
                  onChange={(e) => setConteudoText(e.target.value)}
                  placeholder="Redija o conteúdo do documento ou selecione um modelo oficial acima..."
                  className={inputClass + " font-serif text-sm sm:text-base leading-relaxed resize-y"}
                />
              </div>
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

      {/* Fora do <form>: o modal de configuração tem o próprio form, e o submit
          dele subiria pela árvore do React até o handleSubmit deste. */}
      {showConfigModal && (
        <LaudoConfigModal
          onClose={() => setShowConfigModal(false)}
          onSaved={aoSalvarDadosProfissionais}
        />
      )}

      {termoAberto && (
        <TermoResponsabilidade
          conteudo={conteudoText}
          termoRef={termoRef}
          revisarRef={revisarRef}
          onRevisar={revisarDocumento}
          onAceitar={aceitarTermo}
        />
      )}
    </div>
  );
}

interface TermoResponsabilidadeProps {
  conteudo: string;
  termoRef: React.RefObject<HTMLDivElement | null>;
  revisarRef: React.RefObject<HTMLButtonElement | null>;
  onRevisar: () => void;
  onAceitar: () => void;
}

function TermoResponsabilidade({ conteudo, termoRef, revisarRef, onRevisar, onAceitar }: TermoResponsabilidadeProps) {
  // Campos de modelo ainda em aberto. Não bloqueia: a pessoa decide se salva
  // assim — o termo só garante que ela viu.
  const marcadores = marcadoresPendentes(conteudo);
  const { exibir, restantes } = resumirMarcadores(marcadores);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-text/20 backdrop-blur-sm" onClick={onRevisar} />
      <div
        ref={termoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="termo-responsabilidade-titulo"
        aria-describedby={
          marcadores.length > 0
            ? "termo-responsabilidade-texto termo-responsabilidade-marcadores"
            : "termo-responsabilidade-texto"
        }
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl border border-border/60 p-6"
      >
        <h3 id="termo-responsabilidade-titulo" className="text-lg font-serif font-medium text-text mb-3">
          Termo de Responsabilidade na Emissão de Documentos
        </h3>
        <p id="termo-responsabilidade-texto" className="text-sm text-text-muted leading-relaxed mb-5">
          Os modelos oferecidos pelo PsiSetting são apenas um ponto de partida. O conteúdo e as
          informações deste documento são de responsabilidade do(a) psicólogo(a) que o emite, a
          quem cabe revisar e conferir tudo antes da emissão, conforme as normas do Conselho
          Federal de Psicologia (Resolução CFP nº 06/2019) e o Código de Ética Profissional do
          Psicólogo.
        </p>

        {marcadores.length > 0 && (
          <div
            id="termo-responsabilidade-marcadores"
            className="mb-5 p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs sm:text-[13px] text-amber-950 flex items-start gap-2"
          >
            <AlertCircle size={15} className="text-amber-800 shrink-0 mt-0.5" />
            <div className="space-y-1.5 min-w-0">
              <p>
                <strong>O texto ainda tem campos a completar:</strong>
              </p>
              <ul className="list-disc pl-4 space-y-0.5 break-words">
                {exibir.map((m, i) => (
                  <li key={`${i}-${m}`}>{m}</li>
                ))}
              </ul>
              {restantes > 0 && <p>e mais {restantes}.</p>}
              <p>Para completá-los antes de salvar, clique em “Revisar documento”.</p>
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
          <button
            ref={revisarRef}
            type="button"
            onClick={onRevisar}
            className="px-4 py-2 rounded-xl text-sm font-medium text-text-muted hover:bg-background transition-colors cursor-pointer
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            Revisar documento
          </button>
          <button
            type="button"
            onClick={onAceitar}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium
                       hover:bg-primary-dark active:scale-[0.98] transition-all cursor-pointer
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <Check size={16} />
            Estou de acordo e me responsabilizo
          </button>
        </div>
      </div>
    </div>
  );
}

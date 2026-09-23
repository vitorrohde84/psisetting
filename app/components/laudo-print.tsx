"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  Download,
  Share2,
  FileText,
  PenTool,
  ShieldCheck,
  Settings,
  AlertCircle,
  Loader2
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { decryptClinicalData , ehCifrado } from "@/utils/crypto";
import { camposFaltando, itensRodape, juntarRotulos, texto } from "@/utils/dados-profissionais";
import { LaudoConfigModal } from "./laudo-config-modal";

interface LaudoPrintProps {
  pacienteNome: string;
  pacienteCpf: string;
  pacienteNascimento?: string;
  titulo: string;
  conteudo: string;
  psicologoNome?: string;
  psicologoCrp?: string;
  psicologoTelefone?: string;
  psicologoEndereco?: string;
  psicologoLogoUrl?: string | null;
  onPrinted: () => void; // Closes the modal
}

interface ProfileData {
  nome: string | null;
  nome_completo?: string | null;
  crp: string | null;
  telefone: string | null;
  genero?: string | null;
  cidade?: string | null;
  endereco?: string | null;
  logo_url: string | null;
}

export function LaudoPrint({
  pacienteNome,
  pacienteCpf,
  titulo,
  conteudo,
  psicologoNome: propNome,
  psicologoCrp: propCrp,
  psicologoTelefone: propTelefone,
  psicologoEndereco: propEndereco,
  psicologoLogoUrl: propLogoUrl,
  onPrinted,
}: LaudoPrintProps) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [incluirAssinatura, setIncluirAssinatura] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  // Leitura do perfil que falhou. Sem ela, "perfil null" ficava igual a
  // "carregando" para sempre — e o documento podia sair sem nome, CRP e cidade.
  const [erroPerfil, setErroPerfil] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const [decryptedNome, setDecryptedNome] = useState(pacienteNome);
  const [decryptedCpf, setDecryptedCpf] = useState(pacienteCpf);
  const [decryptedConteudo, setDecryptedConteudo] = useState(conteudo);

  const supabase = createClient();

  // Falha (sem sessão, erro do banco, rede) apaga o perfil em vez de manter o
  // anterior: sem perfil conferido o documento fica bloqueado, e é melhor pedir
  // "Tentar de novo" do que emitir com dados que podem ter acabado de mudar.
  // Numa recarga bem-sucedida (depois de salvar em "Personalizar"), o perfil
  // antigo fica na tela até o novo chegar, sem piscar o bloqueio.
  const loadProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão não encontrada.");
      const { data, error } = await supabase
        .from("profiles")
        .select("nome, nome_completo, crp, telefone, genero, cidade, endereco, logo_url")
        .eq("id", user.id)
        .single();
      if (error || !data) throw error ?? new Error("Perfil não encontrado.");
      setProfile(data);
      setErroPerfil(false);
    } catch (e) {
      console.error("Erro ao carregar perfil para laudo:", e);
      setProfile(null);
      setErroPerfil(true);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      setCanShare(true);
    }

    // Decodificar dados do paciente e conteúdo se estiverem criptografados
    async function decryptInfo() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        if (pacienteNome && ehCifrado(pacienteNome)) {
          setDecryptedNome(await decryptClinicalData(pacienteNome, user.id));
        } else {
          setDecryptedNome(pacienteNome);
        }

        if (pacienteCpf && ehCifrado(pacienteCpf)) {
          setDecryptedCpf(await decryptClinicalData(pacienteCpf, user.id));
        } else {
          setDecryptedCpf(pacienteCpf);
        }

        if (conteudo && ehCifrado(conteudo)) {
          setDecryptedConteudo(await decryptClinicalData(conteudo, user.id));
        } else {
          setDecryptedConteudo(conteudo);
        }
      } catch (err) {
        console.error("Erro ao decodificar dados do laudo:", err);
      }
    }
    decryptInfo();

    loadProfile();
  }, [propNome, propCrp, pacienteNome, pacienteCpf, conteudo, loadProfile]);

  // Sem valor padrão: o que não estiver no perfil fica em branco. Um "exemplo"
  // aqui sai impresso como se fosse o nome, o CRP e o contato de quem assina.
  const nomeTopo = texto(propNome) || texto(profile?.nome) || texto(profile?.nome_completo);
  const nomeAssinatura = texto(profile?.nome_completo) || texto(propNome) || texto(profile?.nome);
  const crpProfissional = texto(propCrp) || texto(profile?.crp);
  const telefoneProfissional = texto(propTelefone) || texto(profile?.telefone);
  const cidadeProfissional = texto(profile?.cidade);
  const enderecoProfissional = texto(propEndereco) || texto(profile?.endereco);
  const rodape = itensRodape({ endereco: enderecoProfissional, telefone: telefoneProfissional });

  // A lista de laudos já não abre esta tela com dado obrigatório faltando, mas
  // aqui ainda dá para apagar o CRP em "Personalizar" e imprimir em seguida.
  // Perfil ainda não lido (carregando ou leitura que falhou) NÃO conta como
  // conferido: camposFaltando(null) devolve tudo faltando, e o documento fica
  // bloqueado até o perfil chegar — senão sairia sem nome, CRP e cidade.
  const perfilConferido = profile !== null;
  const faltando = camposFaltando(
    perfilConferido
      ? { nome: nomeTopo, nome_completo: nomeAssinatura, crp: crpProfissional, cidade: cidadeProfissional }
      : null
  );
  const bloqueado = faltando.length > 0;

  const tituloProfissional =
    profile?.genero === "M"
      ? "Psicólogo Clínico"
      : profile?.genero === "outro"
      ? "Psicólogo(a) Clínico(a)"
      : "Psicóloga Clínica";

  const rawLogoUrl = propLogoUrl !== undefined ? propLogoUrl : profile?.logo_url;
  const logoSrc = rawLogoUrl
    ? (rawLogoUrl.startsWith("http") || rawLogoUrl.startsWith("data:")
      ? rawLogoUrl
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${rawLogoUrl}`)
    : null;

  // Iniciais do profissional para monograma fallback
  const initials = nomeTopo
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const dateStr = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  function formatCPF(cpf: string) {
    const d = cpf.replace(/\D/g, "");
    if (d.length !== 11) return cpf;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  function tentarCarregarPerfilDeNovo() {
    setErroPerfil(false);
    loadProfile();
  }

  // Os botões já ficam desabilitados sem perfil conferido; a conferência aqui
  // repete a regra para um clique que chegue antes do re-render.
  function handlePrintOrSave() {
    if (!perfilConferido) return;
    if (bloqueado) {
      setShowConfigModal(true);
      return;
    }
    window.print();
  }

  async function handleShare() {
    if (!perfilConferido) return;
    if (bloqueado) {
      setShowConfigModal(true);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: titulo || "Laudo Psicológico",
          text: `Laudo Psicológico - ${decryptedNome}\nEmitido por ${nomeTopo}${crpProfissional ? ` (${crpProfissional})` : ""}`,
        });
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          window.print();
        }
      }
    } else {
      window.print();
    }
  }

  if (!mounted) return null;

  // A classe "bloqueado" no #print-root vale também para o Ctrl+P / menu
  // Imprimir do navegador, que não passa pelos botões: o CSS de impressão
  // abaixo troca o documento pelo aviso de dados faltando.
  const content = (
    <div
      id="print-root"
      className={`fixed inset-0 z-[1000] bg-stone-900/70 backdrop-blur-sm overflow-y-auto flex flex-col items-center${bloqueado ? " bloqueado" : ""}`}
    >
      {/* ===== BARRA SUPERIOR DE AÇÕES (Oculta na impressão) ===== */}
      <nav
        aria-label="Ações do documento"
        className="no-print sticky top-0 left-0 right-0 w-full bg-white/95 backdrop-blur-md border-b border-stone-200 z-50 px-4 py-3 shadow-md shrink-0"
      >
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Lado Esquerdo: Voltar & Título */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onPrinted}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 active:scale-95 transition-all cursor-pointer"
              title="Voltar para a lista de laudos"
            >
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">Voltar</span>
            </button>

            <div className="h-5 w-px bg-stone-200 hidden sm:block" />

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-primary shrink-0 hidden xs:block" />
                <h3 className="text-sm font-semibold text-stone-800 truncate max-w-[180px] sm:max-w-[280px] md:max-w-[400px]">
                  {titulo || "Laudo Psicológico"}
                </h3>
              </div>
              <p className="text-xs text-stone-500 truncate hidden sm:block">
                Paciente: {decryptedNome || "Desconhecido"}
              </p>
            </div>
          </div>

          {/* Lado Direito: Opção de Assinatura & Botões de Ação */}
          <div className="flex items-center flex-wrap gap-2 shrink-0">
            {/* Toggle: Incluir Assinatura */}
            <label
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium bg-stone-100 hover:bg-stone-200/80 text-stone-700 cursor-pointer select-none transition-colors border border-stone-200"
              title="Ativar ou desativar a assinatura da profissional no documento"
            >
              <input
                type="checkbox"
                checked={incluirAssinatura}
                onChange={(e) => setIncluirAssinatura(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
              />
              <PenTool size={14} className="text-stone-500 hidden xs:block" />
              <span>Assinatura</span>
            </label>

            {/* Botão de Personalização do Papel Timbrado / Dados */}
            <button
              onClick={() => setShowConfigModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium
                         bg-stone-100 hover:bg-stone-200/90 text-stone-700 active:scale-95 transition-all cursor-pointer border border-stone-200"
              title="Personalizar dados do papel timbrado, nome, cargo, CRP e rodapé"
            >
              <Settings size={14} className="text-stone-500" />
              <span className="hidden xs:inline">Personalizar</span>
            </button>

            {/* Compartilhar (visível no celular) */}
            {canShare && (
              <button
                onClick={handleShare}
                disabled={!perfilConferido}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium
                           bg-stone-100 hover:bg-stone-200 text-stone-700 active:scale-95 transition-all cursor-pointer
                           disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                title={perfilConferido ? "Compartilhar" : "Aguarde: conferindo nome, CRP e cidade"}
              >
                <Share2 size={16} />
                <span className="hidden sm:inline">Compartilhar</span>
              </button>
            )}

            {/* Salvar PDF / Imprimir */}
            <button
              onClick={handlePrintOrSave}
              disabled={!perfilConferido}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold
                         bg-primary text-white hover:bg-primary-dark active:scale-95 shadow-sm transition-all cursor-pointer
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary disabled:active:scale-100"
              title={
                perfilConferido
                  ? "Salvar como PDF ou Imprimir documento"
                  : "Aguarde: conferindo nome, CRP e cidade"
              }
            >
              {perfilConferido || erroPerfil ? (
                <Download size={16} />
              ) : (
                <Loader2 size={16} className="animate-spin" />
              )}
              <span>Salvar PDF / Imprimir</span>
            </button>
          </div>
        </div>

        {/* Sem perfil lido não há como saber se o documento teria autor: a
            emissão espera, e a falha é dita com clareza, com como sair dela. */}
        {erroPerfil && (
          <div
            role="alert"
            className="max-w-6xl mx-auto mt-2.5 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm text-rose-900 flex flex-wrap items-center gap-x-2 gap-y-1"
          >
            <AlertCircle size={15} className="text-rose-700 shrink-0" />
            <span>
              Não foi possível carregar seus dados profissionais (nome, CRP e cidade). O documento
              só pode ser emitido depois de conferi-los.
            </span>
            <button
              type="button"
              onClick={tentarCarregarPerfilDeNovo}
              className="font-semibold underline underline-offset-2 hover:text-rose-700 cursor-pointer"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {perfilConferido && faltando.length > 0 && (
          <div
            role="alert"
            className="max-w-6xl mx-auto mt-2.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-950 flex flex-wrap items-center gap-x-2 gap-y-1"
          >
            <AlertCircle size={15} className="text-amber-800 shrink-0" />
            <span>
              Para emitir documentos, preencha: <strong>{juntarRotulos(faltando)}</strong>.
            </span>
            <button
              type="button"
              onClick={() => setShowConfigModal(true)}
              className="font-semibold underline underline-offset-2 hover:text-amber-800 cursor-pointer"
            >
              Preencher agora
            </button>
          </div>
        )}
      </nav>

      {/* Sempre montado: leitor de tela só anuncia mudança em região que já existia. */}
      <p role="status" className="sr-only">
        {!perfilConferido && !erroPerfil ? "Conferindo nome, CRP e cidade antes de liberar o documento…" : ""}
      </p>

      {/* Só aparece no papel/PDF, e só quando o documento está bloqueado: é o
          que o Ctrl+P imprime no lugar de um documento sem autor. */}
      <div className="aviso-impressao-bloqueada hidden" aria-hidden="true">
        <p>
          {perfilConferido
            ? `Preencha ${juntarRotulos(faltando)} em Configurações do Laudo para emitir este documento.`
            : "Nome, CRP e cidade ainda não foram conferidos. Volte à tela do documento, aguarde o carregamento (ou use \"Tentar de novo\") e emita outra vez."}
        </p>
      </div>

      {/* ===== ÁREA DO DOCUMENTO A4 ===== */}
      <div className="w-full flex-1 p-4 sm:p-6 md:p-8 flex justify-center items-start">
        <div
          ref={documentRef}
          id="print-section"
          className="w-full max-w-[210mm] min-h-[297mm] bg-white text-stone-900 shadow-2xl rounded-sm p-8 sm:p-10 md:p-[16mm] font-serif relative flex flex-col justify-between"
          style={{ boxSizing: "border-box" }}
        >
          {/* Topo / Cabeçalho da Psicóloga */}
          <div>
            <div className="relative flex flex-col items-center justify-center text-center pb-4 mb-6 border-b border-stone-200">
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt={nomeTopo ? `Logo ${nomeTopo}` : "Logo"}
                  className="h-16 sm:h-18 w-auto mb-2 object-contain max-w-[200px]"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-stone-100 border border-stone-300 flex items-center justify-center mb-2 shadow-xs">
                  <span className="text-xl font-bold font-serif text-stone-700">{initials || "Ψ"}</span>
                </div>
              )}

              {nomeTopo && (
                <h1 className="text-2xl sm:text-[24px] font-extrabold uppercase tracking-[0.16em] text-stone-800 mb-0.5 font-serif">
                  {nomeTopo}
                </h1>
              )}
              <p className="text-sm sm:text-base text-stone-500 italic mb-2 font-serif">
                {tituloProfissional}
              </p>
              {crpProfissional && (
                <div className="inline-flex items-center justify-center px-4 py-0.5 border border-stone-300 rounded-full bg-stone-50 shadow-xs">
                  <p className="text-xs font-bold text-stone-600 tracking-wider">
                    {crpProfissional}
                  </p>
                </div>
              )}
            </div>

            {/* Título do Documento */}
            <div className="text-center mb-8">
              <h2 className="inline-block text-lg sm:text-xl font-bold uppercase tracking-[0.2em] text-stone-800 border-b border-stone-300 pb-1 px-8 sm:px-12 font-serif">
                {titulo || "Laudo Psicológico"}
              </h2>
            </div>

            {/* Corpo do Laudo */}
            <div className="text-justify leading-[1.9] whitespace-pre-wrap mb-6 text-[11pt] text-stone-800 font-serif">
              {decryptedConteudo}
            </div>
          </div>

          {/* Encerramento, Assinatura e Rodapé */}
          <div className="mt-4 flex flex-col items-center justify-center pt-2 w-full">
            <p className="text-center text-stone-600 text-[10pt] mb-6 italic font-serif">
              {cidadeProfissional ? `${cidadeProfissional}. ` : ""}{dateStr}.
            </p>

            {incluirAssinatura && (
              <div className="inline-flex flex-col items-center min-w-[280px] max-w-[450px] border-t border-stone-400 text-center pt-2 mb-6 px-4">
                <p className="font-bold text-[11pt] text-stone-800 mb-0.5 tracking-wide uppercase font-serif whitespace-nowrap">
                  {nomeAssinatura}
                </p>
                <p className="text-xs text-stone-500 italic font-serif whitespace-nowrap">
                  {tituloProfissional}{crpProfissional ? ` - ${crpProfissional}` : ""}
                </p>
              </div>
            )}

            {/* Rodapé Institucional com Endereço e Contato — só o que foi preenchido */}
            {rodape.length > 0 && (
              <div className="w-full pt-2.5 border-t border-stone-200 text-center">
                <p className="text-[8.5pt] text-stone-500 font-sans tracking-wide">
                  {rodape.join("  |  ")}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Estilos Específicos para Impressão */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          @page {
            margin: 0 !important;
            size: A4 portrait;
          }
          
          body > *:not(#print-root) {
            display: none !important;
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            height: 100% !important;
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .no-print {
            display: none !important;
          }

          #print-root {
            position: static !important;
            display: block !important;
            width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          #print-section {
            width: 210mm !important;
            max-width: 210mm !important;
            min-height: 297mm !important;
            height: 297mm !important;
            max-height: 297mm !important;
            margin: 0 !important;
            padding: 14mm 18mm 12mm 18mm !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            overflow: hidden !important;
          }

          /* Documento bloqueado (dado obrigatório faltando ou perfil não
             conferido): o Ctrl+P imprime só o aviso, nunca o documento. */
          #print-root.bloqueado #print-section {
            display: none !important;
          }

          #print-root.bloqueado .aviso-impressao-bloqueada {
            display: block !important;
            width: 210mm !important;
            padding: 40mm 24mm !important;
            box-sizing: border-box !important;
            font-family: Georgia, "Times New Roman", serif !important;
            font-size: 14pt !important;
            line-height: 1.6 !important;
            text-align: center !important;
            color: #000000 !important;
          }
        }
      `}} />
    </div>
  );

  // O modal vai direto para o <body>, FORA do #print-root: o backdrop-blur de
  // lá (backdrop-filter) vira bloco de contenção para position:fixed, e com a
  // página rolada o modal abria fora da tela. Continua no-print — e, como filho
  // do <body> que não é o #print-root, a regra de impressão já o esconde.
  return (
    <>
      {createPortal(content, document.body)}
      {showConfigModal &&
        createPortal(
          <div className="no-print">
            <LaudoConfigModal
              onClose={() => setShowConfigModal(false)}
              onSaved={loadProfile}
            />
          </div>,
          document.body
        )}
    </>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  Download,
  Printer,
  Share2,
  Loader2,
  FileText,
  CheckCircle2,
  AlertCircle,
  PenTool
} from "lucide-react";
import { downloadPdf, sharePdf } from "@/utils/pdf-export";
import { LOGO_BASE64 } from "@/utils/logo-base64";

interface LaudoPrintProps {
  pacienteNome: string;
  pacienteCpf: string;
  pacienteNascimento?: string;
  titulo: string;
  conteudo: string;
  onPrinted: () => void; // Closes the modal
}

export function LaudoPrint({
  pacienteNome,
  pacienteCpf,
  titulo,
  conteudo,
  onPrinted,
}: LaudoPrintProps) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [incluirAssinatura, setIncluirAssinatura] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    // Check if Web Share API is available (iOS / Android)
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      setCanShare(true);
    }
  }, []);

  const dateStr = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  function formatCPF(cpf: string) {
    const d = cpf.replace(/\D/g, "");
    if (d.length !== 11) return cpf;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  function getPdfFilename() {
    const sanitize = (s: string) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");

    const safeTitulo = sanitize(titulo || "Laudo");
    const safeNome = sanitize(pacienteNome || "Paciente");
    const dataHoje = format(new Date(), "dd-MM-yyyy");
    return `${safeTitulo}_${safeNome}_${dataHoje}.pdf`;
  }

  async function handleDownloadPdf() {
    if (!documentRef.current || isGenerating) return;
    setIsGenerating(true);
    setFeedback(null);

    try {
      const filename = getPdfFilename();
      await downloadPdf(documentRef.current, filename);
      setFeedback({ type: "success", message: "PDF baixado com sucesso!" });
      setTimeout(() => setFeedback(null), 3500);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      setFeedback({ type: "error", message: "Erro ao gerar PDF. Tente a opção Imprimir." });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSharePdf() {
    if (!documentRef.current || isSharing) return;
    setIsSharing(true);
    setFeedback(null);

    try {
      const filename = getPdfFilename();
      await sharePdf(documentRef.current, filename, titulo || "Laudo Psicológico");
    } catch (err) {
      console.error("Erro ao compartilhar PDF:", err);
      setFeedback({ type: "error", message: "Não foi possível abrir o compartilhamento." });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setIsSharing(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (!mounted) return null;

  const content = (
    <div
      id="print-root"
      className="fixed inset-0 z-[1000] bg-stone-900/70 backdrop-blur-sm overflow-y-auto flex flex-col items-center"
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
                Paciente: {pacienteNome || "Desconhecido"}
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

            {/* Feedback message */}
            {feedback && (
              <div
                className={`hidden md:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg mr-2 animate-fadeIn ${feedback.type === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
                  }`}
              >
                {feedback.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <span>{feedback.message}</span>
              </div>
            )}

            {/* Compartilhar (visível no celular) */}
            {canShare && (
              <button
                onClick={handleSharePdf}
                disabled={isSharing || isGenerating}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium
                           bg-stone-100 hover:bg-stone-200 text-stone-700 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                title="Compartilhar PDF (WhatsApp, etc.)"
              >
                {isSharing ? (
                  <Loader2 size={16} className="animate-spin text-primary" />
                ) : (
                  <Share2 size={16} />
                )}
                <span className="hidden sm:inline">Compartilhar</span>
              </button>
            )}

            {/* Baixar PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={isGenerating || isSharing}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                         bg-primary text-white hover:bg-primary-dark active:scale-95 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              title="Baixar arquivo PDF no dispositivo"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Gerando...</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>Salvar PDF</span>
                </>
              )}
            </button>

            {/* Imprimir */}
            <button
              onClick={handlePrint}
              disabled={isGenerating}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium
                         border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 active:scale-95 transition-all cursor-pointer"
              title="Abrir diálogo de impressão do navegador"
            >
              <Printer size={16} />
              <span className="hidden sm:inline">Imprimir</span>
            </button>
          </div>
        </div>
      </nav>

      {/* ===== ÁREA DO DOCUMENTO A4 ===== */}
      <div className="w-full flex-1 p-3 sm:p-6 md:p-8 flex justify-center items-start">
        <div
          ref={documentRef}
          id="print-section"
          className="w-full max-w-[210mm] min-h-[297mm] bg-white text-stone-900 shadow-2xl rounded-sm p-6 sm:p-10 md:p-[18mm] font-serif relative flex flex-col justify-between"
          style={{ boxSizing: "border-box" }}
        >
          {/* Topo / Cabeçalho da Psicóloga */}
          <div>
            <div className="relative flex flex-col items-center justify-center text-center pb-5 mb-7 border-b border-stone-200">
              <img
                src={LOGO_BASE64}
                alt="Logo Hellen Limberger"
                className="h-20 sm:h-22 w-auto mb-2 object-contain"
              />

              <h1 className="text-2xl sm:text-[25px] font-extrabold uppercase tracking-[0.18em] text-stone-800 mb-1 font-serif">
                Hellen Limberger
              </h1>
              <p className="text-base sm:text-lg text-stone-500 italic mb-2.5 font-serif">
                Psicóloga Clínica
              </p>
              <div className="inline-flex items-center justify-center px-4 py-0.5 border border-stone-300 rounded-full bg-stone-50 shadow-xs">
                <p className="text-xs sm:text-sm font-bold text-stone-600 tracking-wider">
                  CRP 07/45016
                </p>
              </div>
            </div>

            {/* Título do Documento */}
            <div className="text-center mb-7">
              <h2 className="inline-block text-lg sm:text-xl font-bold uppercase tracking-[0.2em] text-stone-800 border-b border-stone-300 pb-1.5 px-6 sm:px-12 font-serif">
                {titulo || "Laudo Psicológico"}
              </h2>
            </div>

            {/* Identificação do Paciente */}
            <div className="mb-7 bg-stone-50/70 p-4 sm:p-5 rounded-xl border border-stone-200">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-3 flex items-center gap-2">
                <span className="w-6 h-px bg-stone-300" />
                Identificação do Paciente
                <span className="flex-1 h-px bg-stone-200" />
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 text-[11pt]">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">
                    Nome Completo
                  </span>
                  <span className="text-stone-800 font-medium text-base sm:text-lg border-b border-stone-200 pb-1">
                    {pacienteNome}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">
                    Documento (CPF)
                  </span>
                  <span className="text-stone-800 font-medium text-base sm:text-lg border-b border-stone-200 pb-1">
                    {pacienteCpf ? formatCPF(pacienteCpf) : "Não informado"}
                  </span>
                </div>
              </div>
            </div>

            {/* Corpo do Laudo */}
            <div className="text-justify leading-[1.9] whitespace-pre-wrap mb-10 text-[11pt] text-stone-800 font-serif">
              {conteudo}
            </div>
          </div>

          {/* Encerramento, Assinatura e Rodapé */}
          <div className="mt-6 flex flex-col items-center justify-center pt-4 w-full">
            <p className="text-center text-stone-600 text-[10.5pt] sm:text-[11pt] mb-8 italic font-serif">
              Santa Maria, RS. {dateStr}.
            </p>

            {incluirAssinatura && (
              <div className="w-full max-w-[320px] border-t border-stone-400 text-center pt-2.5 mb-7">
                <p className="font-bold text-[12pt] sm:text-[13pt] text-stone-800 mb-0.5 tracking-wide uppercase font-serif">
                  Hellen Ketlyn Limberger Silva
                </p>
                <p className="text-xs sm:text-sm text-stone-500 italic font-serif">
                  Psicóloga Clínica - CRP 07/45016
                </p>
              </div>
            )}

            {/* Rodapé Institucional com Endereço e Contato */}
            <div className="w-full pt-3 border-t border-stone-200 text-center">
              <p className="text-[9.5pt] text-stone-500 font-sans tracking-wide">
                End: Santa Maria - RS &nbsp;|&nbsp; Contato: (55) 99654-7714
              </p>
            </div>
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
          
          /* Ocultar toda a aplicação e elementos externos */
          body > *:not(#print-root) {
            display: none !important;
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: #ffffff !important;
            color: #000000 !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .no-print {
            display: none !important;
          }

          #print-root {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            display: block !important;
          }

          #print-section {
            width: 100% !important;
            max-width: 210mm !important;
            min-height: 297mm !important;
            height: 297mm !important;
            margin: 0 auto !important;
            padding: 16mm 18mm 14mm 18mm !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}} />
    </div>
  );

  return createPortal(content, document.body);
}

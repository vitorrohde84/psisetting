"use client";

import { useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LaudoPrintProps {
  pacienteNome: string;
  pacienteCpf: string;
  pacienteNascimento?: string;
  titulo: string;
  conteudo: string;
  onPrinted: () => void;
}

export function LaudoPrint({
  pacienteNome,
  pacienteCpf,
  pacienteNascimento,
  titulo,
  conteudo,
  onPrinted,
}: LaudoPrintProps) {
  useEffect(() => {
    // Automatically trigger print dialog when component mounts
    // Small timeout to ensure rendering is complete
    const timer = setTimeout(() => {
      window.print();
      onPrinted(); // Callback to restore original view
    }, 500);

    return () => clearTimeout(timer);
  }, [onPrinted]);

  const dateStr = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  // Calculate age if birthdate is provided
  let idadeInfo = "";
  if (pacienteNascimento) {
    const birth = new Date(pacienteNascimento + "T00:00:00");
    const age = new Date().getFullYear() - birth.getFullYear();
    idadeInfo = `, ${age} anos`;
  }

  function formatCPF(cpf: string) {
    const d = cpf.replace(/\D/g, "");
    if (d.length !== 11) return cpf;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  return (
    <div id="print-section" className="fixed inset-0 z-[100] bg-white text-black min-h-screen w-full overflow-y-auto">
      <div className="max-w-[21cm] mx-auto min-h-[29.7cm] p-[2cm] font-serif bg-white relative">

        {/* Cabeçalho Profissional */}
        <header className="relative flex flex-col items-center justify-center text-center pb-10 mb-12 border-b border-stone-200">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-stone-800/10 rounded-full mb-8" />
          
          <img src="/logo1.png" alt="Logo Hellen Limberger" className="h-32 w-auto mb-6 object-contain" />
          
          <h1 className="text-3xl font-extrabold uppercase tracking-[0.2em] text-stone-800 mb-2 font-serif">
            Hellen Limberger
          </h1>
          <p className="text-xl text-stone-500 italic mb-4 font-serif">Psicóloga Clínica</p>
          <div className="inline-flex items-center justify-center px-5 py-1.5 border border-stone-200 rounded-full bg-stone-50 shadow-sm">
            <p className="text-sm font-bold text-stone-600 tracking-widest">
              CRP 07/45016
            </p>
          </div>
        </header>

        {/* Título do Documento */}
        <div className="text-center mb-12">
          <h2 className="inline-block text-xl font-bold uppercase tracking-[0.25em] text-stone-800 border-b border-stone-300 pb-3 px-12">
            {titulo || "Laudo Psicológico"}
          </h2>
        </div>

        {/* Identificação do Paciente */}
        <div className="mb-12 relative bg-stone-50/50 p-8 rounded-2xl border border-stone-100">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-6 flex items-center gap-3">
            <span className="w-8 h-px bg-stone-300" />
            Identificação do Paciente
            <span className="flex-1 h-px bg-stone-200" />
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-12 text-[11.5pt]">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">Nome Completo</span> 
              <span className="text-stone-800 font-medium text-lg border-b border-stone-200 pb-2">{pacienteNome} {idadeInfo}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">Documento (CPF)</span> 
              <span className="text-stone-800 font-medium text-lg border-b border-stone-200 pb-2">{pacienteCpf ? formatCPF(pacienteCpf) : "Não informado"}</span>
            </div>
          </div>
        </div>

        {/* Corpo do Laudo */}
        <div
          className="text-justify leading-[2.2] whitespace-pre-wrap mb-24 text-[12pt] text-stone-800 font-serif"
        >
          {conteudo}
        </div>

        {/* Encerramento e Assinatura */}
        <div className="mt-auto flex flex-col items-center justify-center pt-16 border-t border-stone-100">
          <p className="text-center text-stone-500 text-[11pt] mb-20 italic">
            Santa Maria, RS. {dateStr}.
          </p>

          <div className="w-[10cm] border-t border-stone-400 text-center pt-4 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-2 text-stone-300 text-xl font-serif">
              ❦
            </div>
            <p className="font-bold text-[13pt] text-stone-800 mb-1 tracking-wide uppercase font-serif">Hellen Limberger</p>
            <p className="text-sm text-stone-500 italic font-serif">Psicóloga Clínica - CRP 07/45016</p>
          </div>
        </div>

      </div>

      {/* Estilos Globais para Ocultar Interface Padrão Durante Impressão */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          @page {
            margin: 0;
            size: A4 portrait;
          }
          html, body {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }
          body * {
            visibility: hidden;
          }
          #print-section, #print-section * {
            visibility: visible;
          }
          #print-section {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}} />
    </div>
  );
}

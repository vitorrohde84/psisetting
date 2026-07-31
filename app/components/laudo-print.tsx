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
        <header className="flex flex-col items-center justify-center text-center pb-8 mb-10 border-b-2 border-stone-300">
          <img src="/logo1.png" alt="Logo Hellen Limberger" className="h-28 mb-5 object-contain" />
          <h1 className="text-2xl font-bold uppercase tracking-widest text-stone-800 mb-1.5">
            Hellen Limberger
          </h1>
          <p className="text-lg text-stone-600 italic mb-1.5">Psicóloga Clínica</p>
          <p className="text-sm font-semibold text-stone-500 tracking-wide">
            CRP 07/45016
          </p>
        </header>

        {/* Título do Documento */}
        <h2 className="text-xl font-bold text-center uppercase tracking-widest text-stone-800 mb-10">
          {titulo || "Laudo Psicológico"}
        </h2>

        {/* Identificação do Paciente */}
        <div className="mb-10 p-6 rounded-xl border border-stone-200 bg-stone-50/50">
          <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-4 border-b border-stone-200 pb-2">Identificação do Paciente</h3>
          <div className="flex flex-col sm:flex-row sm:items-center gap-6 text-[11pt]">
            <p className="text-stone-800">
              <span className="font-bold text-stone-600 mr-2">NOME:</span> 
              {pacienteNome} {idadeInfo}
            </p>
            <p className="text-stone-800">
              <span className="font-bold text-stone-600 mr-2">CPF:</span> 
              {pacienteCpf ? formatCPF(pacienteCpf) : "Não informado"}
            </p>
          </div>
        </div>

        {/* Corpo do Laudo */}
        <div
          className="text-justify leading-loose whitespace-pre-wrap mb-20 text-[11.5pt] text-stone-800"
        >
          {conteudo}
        </div>

        {/* Encerramento e Assinatura */}
        <div className="mt-auto flex flex-col items-center justify-center pt-10">
          <p className="text-center text-stone-600 text-[11pt] mb-16">
            Santa Maria, RS. {dateStr}.
          </p>

          <div className="w-[8.5cm] border-t border-stone-400 text-center pt-3">
            <p className="font-bold text-[12pt] text-stone-800 mb-0.5 tracking-wide">Hellen Limberger</p>
            <p className="text-sm text-stone-500 italic">Psicóloga Clínica - CRP 07/45016</p>
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

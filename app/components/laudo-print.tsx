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
    <div className="fixed inset-0 z-[100] bg-white text-black min-h-screen w-full overflow-y-auto">
      <div className="max-w-[21cm] mx-auto min-h-[29.7cm] p-[2cm] font-serif bg-white">
        
        {/* Cabeçalho Profissional */}
        <header className="flex flex-col items-center justify-center text-center border-b-2 border-black/80 pb-6 mb-8">
          <h1 className="text-2xl font-bold uppercase tracking-wider mb-1">
            Hellen Limberger
          </h1>
          <p className="text-lg font-medium text-black/80 mb-2">Psicóloga Clínica</p>
          <div className="flex items-center justify-center gap-4 text-sm font-semibold text-black/70">
            <span>CRP 07/45016</span>
          </div>
        </header>

        {/* Título do Documento */}
        <h2 className="text-xl font-bold text-center uppercase tracking-wide mb-10">
          {titulo || "Laudo Psicológico"}
        </h2>

        {/* Identificação do Paciente */}
        <div className="mb-8 p-4 bg-gray-50 border border-gray-200">
          <p className="mb-1">
            <span className="font-bold">Paciente:</span> {pacienteNome} {idadeInfo}
          </p>
          <p>
            <span className="font-bold">CPF:</span> {pacienteCpf ? formatCPF(pacienteCpf) : "Não informado"}
          </p>
        </div>

        {/* Corpo do Laudo */}
        <div 
          className="text-justify leading-relaxed whitespace-pre-wrap mb-16 text-[11pt]"
        >
          {conteudo}
        </div>

        {/* Encerramento e Assinatura */}
        <div className="mt-20 flex flex-col items-center justify-center pt-8">
          <p className="text-center mb-16">
            Porto Alegre, {dateStr}.
          </p>
          
          <div className="w-[8cm] border-t border-black text-center pt-2">
            <p className="font-bold text-base mb-0.5">Hellen Limberger</p>
            <p className="text-sm">Psicóloga - CRP 07/45016</p>
          </div>
        </div>

      </div>

      {/* Estilos Globais para Ocultar Interface Padrão Durante Impressão */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page {
            margin: 0;
            size: A4 portrait;
          }
          body > :not(.fixed.inset-0.z-\\[100\\]) {
            display: none !important;
          }
          .fixed.inset-0.z-\\[100\\] {
            position: static !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}} />
    </div>
  );
}

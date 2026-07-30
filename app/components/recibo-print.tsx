"use client";

import { useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ReciboPrintProps {
  pacienteNome: string;
  pacienteCpf: string;
  valor: number;
  dataEmissao: string;
  numeroSequencial: number;
  onPrinted: () => void;
}

export function ReciboPrint({
  pacienteNome,
  pacienteCpf,
  valor,
  dataEmissao,
  numeroSequencial,
  onPrinted,
}: ReciboPrintProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.print();
      onPrinted();
    }, 500);
    return () => clearTimeout(timer);
  }, [onPrinted]);

  function formatCPF(cpf: string) {
    const d = cpf.replace(/\D/g, "");
    if (d.length !== 11) return cpf;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  // Converter valor em moeda
  const valorFormatado = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);

  // Data formatada
  const dateStr = format(new Date(dataEmissao + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  
  // Pad the sequence number (e.g. 0001)
  const numFormatado = numeroSequencial.toString().padStart(4, "0");

  return (
    <div className="fixed inset-0 z-[100] bg-white text-black min-h-screen w-full overflow-y-auto">
      <div className="max-w-[21cm] mx-auto min-h-[29.7cm] p-[2cm] font-sans bg-white border border-gray-100">
        
        {/* Cabeçalho */}
        <header className="flex justify-between items-start border-b-2 border-black/80 pb-6 mb-10">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wider mb-1">
              Hellen Limberger
            </h1>
            <p className="text-base text-black/80">Psicóloga Clínica</p>
            <p className="text-base font-semibold text-black/80 mt-1">CRP 07/45016</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold uppercase mb-2">Recibo</h2>
            <p className="text-sm font-medium text-black/60 uppercase">Nº {numFormatado}</p>
          </div>
        </header>

        {/* Corpo do Recibo */}
        <div className="text-justify leading-loose text-[12pt] mb-12 px-2">
          <p className="mb-4">
            Recebi de <strong>{pacienteNome}</strong>, inscrito(a) no CPF sob o nº <strong>{pacienteCpf ? formatCPF(pacienteCpf) : "______________________"}</strong>, a importância de <strong>{valorFormatado}</strong> referente a sessões de psicoterapia clínica realizadas neste período.
          </p>
          <p className="mb-4">
            Para fins de dedução no Imposto de Renda, declaro que os serviços prestados estão classificados sob o código da Receita Federal (Serviços Psicológicos).
          </p>
          <p>
            Por ser verdade, firmo o presente recibo.
          </p>
        </div>

        {/* Encerramento e Assinatura */}
        <div className="mt-24 flex flex-col items-center justify-center pt-8">
          <p className="text-center mb-16">
            Porto Alegre, {dateStr}.
          </p>
          
          <div className="w-[8cm] border-t border-black text-center pt-2">
            <p className="font-bold text-base mb-0.5">Hellen Limberger</p>
            <p className="text-sm">Psicóloga - CRP 07/45016</p>
          </div>
        </div>

      </div>

      {/* Estilos Globais para Impressão */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { margin: 0; size: A4 portrait; }
          body > :not(.fixed.inset-0.z-\\[100\\]) { display: none !important; }
          .fixed.inset-0.z-\\[100\\] { position: static !important; padding: 0 !important; margin: 0 !important; border: none !important; }
        }
      `}} />
    </div>
  );
}

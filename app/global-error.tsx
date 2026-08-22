"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erro crítico na aplicação:", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#FAF6F0] text-[#2C1E17] flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl border border-[#D4C8B8] p-8 shadow-2xl text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto border border-rose-200">
            <AlertCircle size={28} />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-serif font-bold text-[#2C1E17]">
              PsiSetting — Erro Inesperado
            </h2>
            <p className="text-xs text-[#6B5A4E] leading-relaxed">
              Ocorreu uma instabilidade na página. Seus dados estão seguros e você pode recarregar o sistema a qualquer momento.
            </p>
          </div>

          <button
            type="button"
            onClick={() => reset()}
            className="w-full py-3 px-5 rounded-xl bg-[#5C6753] text-white text-xs font-bold hover:bg-[#4A5342] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            <RefreshCw size={14} />
            <span>Recarregar Aplicativo</span>
          </button>
        </div>
      </body>
    </html>
  );
}

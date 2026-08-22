"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from "lucide-react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erro capturado no dashboard:", error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="max-w-md w-full bg-surface rounded-3xl border border-border/80 p-6 sm:p-8 shadow-xl text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 flex items-center justify-center mx-auto shadow-2xs">
          <ShieldAlert size={28} />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg sm:text-xl font-serif font-bold text-text">
            Não foi possível carregar esta seção
          </h2>
          <p className="text-xs text-text-muted leading-relaxed">
            Seus dados clínicos continuam 100% seguros e guardados. Pode ter ocorrido uma oscilação temporária na conexão de internet.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
          >
            <RefreshCw size={14} />
            <span>Tentar Novamente</span>
          </button>

          <Link
            href="/"
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-border bg-background hover:bg-surface text-text text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home size={14} />
            <span>Voltar ao Início</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

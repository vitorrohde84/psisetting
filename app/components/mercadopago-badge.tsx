"use client";

import { ShieldCheck, Lock } from "lucide-react";

interface MercadoPagoBadgeProps {
  variant?: "full" | "compact" | "card";
  className?: string;
}

export function MercadoPagoBadge({ variant = "full", className = "" }: MercadoPagoBadgeProps) {
  if (variant === "compact") {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#009EE3]/10 border border-[#009EE3]/30 text-xs ${className}`}>
        <MercadoPagoIcon className="w-4 h-4 text-[#009EE3]" />
        <span className="font-semibold text-text text-[11px]">
          Pagamento Seguro <strong className="text-[#009EE3]">Mercado Pago</strong>
        </span>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={`p-4 rounded-2xl bg-gradient-to-r from-[#009EE3]/8 via-surface to-emerald-500/8 border border-[#009EE3]/25 flex items-center justify-between gap-3 shadow-2xs ${className}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#009EE3] text-white flex items-center justify-center shrink-0 shadow-xs">
            <MercadoPagoIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-text">Processamento Seguro</span>
              <span className="text-[10px] font-bold text-[#009EE3] bg-[#009EE3]/15 px-1.5 py-0.5 rounded border border-[#009EE3]/30">
                Oficial
              </span>
            </div>
            <p className="text-[11px] text-text-muted">
              Transações criptografadas de ponta a ponta com a tecnologia do Mercado Pago.
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
          <ShieldCheck size={13} />
          <span>SSL 256-bit</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-3 rounded-2xl bg-[#009EE3]/5 border border-[#009EE3]/20 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-center sm:text-left ${className}`}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-[#009EE3] text-white flex items-center justify-center shrink-0 shadow-2xs">
          <MercadoPagoIcon className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center justify-center sm:justify-start gap-1.5">
            <span className="text-xs font-bold text-text">Mercado Pago</span>
            <span className="text-[10px] text-[#009EE3] font-bold uppercase tracking-wider">
              Ambiente Protegido
            </span>
          </div>
          <p className="text-[11px] text-text-muted">
            Seus dados financeiros nunca são armazenados em nossos servidores.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] font-medium text-text-muted shrink-0">
        <Lock size={11} className="text-emerald-600" />
        <span>Criptografia Bancária</span>
      </div>
    </div>
  );
}

export function MercadoPagoIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" fillOpacity="0.2"/>
      <path d="M7.5 13.5c.8-1.1 2.5-1.5 4.5-1.5s3.7.4 4.5 1.5c-1.2 1.8-3.2 2.5-4.5 2.5s-3.3-.7-4.5-2.5z"/>
      <path d="M12 11c-1.4 0-2.5-1.1-2.5-2.5S10.6 6 12 6s2.5 1.1 2.5 2.5S13.4 11 12 11z"/>
      <path d="M4.5 12c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5c0 1.9-.7 3.6-1.9 4.9-.3-.8-1.7-1.7-3.6-2.1 1-1 1.5-2.2 1.5-3.8 0-2.8-2.2-5-5-5s-5 2.2-5 5c0 1.6.5 2.8 1.5 3.8-1.9.4-3.3 1.3-3.6 2.1-1.2-1.3-1.9-3-1.9-4.9z"/>
    </svg>
  );
}

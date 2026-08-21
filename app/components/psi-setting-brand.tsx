"use client";

import Image from "next/image";

interface PsiSettingBrandProps {
  size?: "sm" | "md" | "lg" | "xl";
  showIcon?: boolean;
  showSubtitle?: boolean;
  subtitleText?: string;
  className?: string;
}

/**
 * Componente oficial de Marca e Logotipo do PsiSetting
 * Utiliza o novo logotipo oficial (Monograma "PS" com poltrona e luminária clínica)
 * acompanhado da tipografia bicolor:
 * - "Psi": Serifada em preto mineral / carvão (#2D2A26)
 * - "Setting": Serifada em verde sálvia / oliva suave (#5C6B50)
 */
export function PsiSettingBrand({
  size = "md",
  showIcon = true,
  showSubtitle = false,
  subtitleText = "Gestão Clínica",
  className = "",
}: PsiSettingBrandProps) {
  const sizeClasses = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-2xl",
    xl: "text-3xl sm:text-4xl",
  };

  const iconDimensions = {
    sm: { size: 28, className: "w-7 h-7 rounded-lg" },
    md: { size: 36, className: "w-9 h-9 rounded-xl" },
    lg: { size: 48, className: "w-12 h-12 rounded-2xl" },
    xl: { size: 64, className: "w-16 h-16 rounded-2xl" },
  };

  const currentIcon = iconDimensions[size];

  return (
    <div className={`inline-flex items-center gap-2.5 leading-tight ${className}`}>
      {showIcon && (
        <div className={`relative shrink-0 overflow-hidden shadow-xs border border-border/40 ${currentIcon.className}`}>
          <Image
            src="/logo.png"
            alt="PsiSetting Logo"
            width={currentIcon.size}
            height={currentIcon.size}
            className="w-full h-full object-cover"
            priority
          />
        </div>
      )}
      <div className="inline-flex flex-col">
        <span className={`font-serif font-medium tracking-normal select-none ${sizeClasses[size]}`}>
          <span className="text-text">Psi</span>
          <span className="text-primary">Setting</span>
        </span>
        {showSubtitle && (
          <span className="text-[10.5px] text-text-muted font-sans font-normal tracking-wide mt-0.5">
            {subtitleText}
          </span>
        )}
      </div>
    </div>
  );
}

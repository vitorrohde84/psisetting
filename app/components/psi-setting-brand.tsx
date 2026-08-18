"use client";

interface PsiSettingBrandProps {
  size?: "sm" | "md" | "lg" | "xl";
  showSubtitle?: boolean;
  subtitleText?: string;
  className?: string;
}

/**
 * Componente oficial de Marca e Tipografia do PsiSetting
 * Estilização bicolor fiel à identidade visual:
 * - "Psi": Serifada em preto mineral / carvão (#2D2A26)
 * - "Setting": Serifada em verde sálvia / oliva suave (#5C6B50)
 */
export function PsiSettingBrand({
  size = "md",
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

  return (
    <div className={`inline-flex flex-col leading-tight ${className}`}>
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
  );
}

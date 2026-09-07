"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PrivacyToggleProps {
  className?: string;
  size?: number;
}

export function PrivacyToggle({ className, size = 18 }: PrivacyToggleProps) {
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);

  useEffect(() => {
    // Verificar localStorage no carregamento
    const saved = localStorage.getItem("privacyMode");
    if (saved === "true") {
      setIsPrivacyMode(true);
      document.body.classList.add("privacy-mode");
    }
  }, []);

  function togglePrivacy() {
    const newState = !isPrivacyMode;
    setIsPrivacyMode(newState);

    if (newState) {
      document.body.classList.add("privacy-mode");
      localStorage.setItem("privacyMode", "true");
    } else {
      document.body.classList.remove("privacy-mode");
      localStorage.setItem("privacyMode", "false");
    }
  }

  const baseClass =
    className ||
    "p-2 rounded-xl bg-background border border-border transition-all cursor-pointer flex items-center justify-center";
  const activeClass = isPrivacyMode
    ? "bg-primary/15 text-primary border-primary/40 shadow-xs"
    : "text-text-muted hover:text-text hover:bg-surface-hover";

  return (
    <button
      onClick={togglePrivacy}
      className={`${baseClass} ${activeClass}`}
      title={
        isPrivacyMode
          ? "Modo Privacidade Ativo: Clique para exibir informações sensíveis"
          : "Ativar Modo Privacidade: Ocultar nomes e valores sensíveis"
      }
      aria-label="Alternar modo privacidade"
    >
      {isPrivacyMode ? <EyeOff size={size} /> : <Eye size={size} />}
    </button>
  );
}

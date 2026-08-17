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
    // Check local storage on mount
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

  if (className) {
    return (
      <button
        onClick={togglePrivacy}
        className={className}
        title={isPrivacyMode ? "Mostrar informações sensíveis" : "Ocultar informações sensíveis (Modo Privacidade)"}
        aria-label="Alternar modo privacidade"
      >
        {isPrivacyMode ? <EyeOff size={size} /> : <Eye size={size} />}
      </button>
    );
  }

  // Desktop default placement (hidden on mobile to prevent overlapping mobile navbar)
  return (
    <button
      onClick={togglePrivacy}
      className={`hidden lg:flex fixed top-4 right-4 z-30 p-2.5 rounded-full shadow-sm transition-all cursor-pointer border ${
        isPrivacyMode 
          ? "bg-primary text-white border-primary" 
          : "bg-surface text-text-muted border-border hover:bg-background hover:text-text"
      }`}
      title={isPrivacyMode ? "Mostrar informações sensíveis" : "Ocultar informações sensíveis (Modo Privacidade)"}
      aria-label="Alternar modo privacidade"
    >
      {isPrivacyMode ? <EyeOff size={20} /> : <Eye size={20} />}
    </button>
  );
}

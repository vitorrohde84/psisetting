"use client";

import { useEffect, useState } from "react";
import { Download, X, Share, PlusSquare } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Já está rodando como PWA (standalone)? O Safari do iOS expõe isso em
// navigator.standalone, que não faz parte do tipo padrão do Navigator.
function detectarStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectarIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
}

export function PwaRegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  // Calculados já no estado inicial (antes eram gravados pelo efeito). No
  // servidor ficam false, mas isso não aparece na tela: o componente devolve
  // null enquanto showInstallBanner for false, e o banner só abre segundos
  // depois da montagem — então servidor e navegador geram o mesmo HTML.
  const [isIos] = useState(detectarIos);
  const [isStandalone] = useState(detectarStandalone);

  useEffect(() => {
    // 1. Registrar Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then(() => {
            // Service worker registrado com sucesso
          })
          .catch((error) => {
            console.warn("Falha no registro do Service Worker:", error);
          });
      });
    }

    // 2. Detectar se já está rodando como PWA (standalone)
    const isRunningStandalone = detectarStandalone();

    // 3. Detectar se é iOS (Safari)
    const isIosDevice = detectarIos();

    // Se já estiver instalado como app, não precisa de banner
    if (isRunningStandalone) return;

    // Verificar se usuário já fechou o banner nesta sessão
    const dismissed = sessionStorage.getItem("pwa_install_banner_dismissed");
    if (dismissed) return;

    // 4. Capturar evento nativo do Chrome / Android
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Exibe banner após 3 segundos para não poluir o carregamento inicial
      setTimeout(() => setShowInstallBanner(true), 3000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Se for iOS e não for standalone, exibe após 4 segundos
    if (isIosDevice && !isRunningStandalone && !dismissed) {
      const timer = setTimeout(() => setShowInstallBanner(true), 4000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  async function handleInstallClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setShowInstallBanner(false);
      }
      setDeferredPrompt(null);
    }
  }

  function handleDismiss() {
    setShowInstallBanner(false);
    sessionStorage.setItem("pwa_install_banner_dismissed", "true");
  }

  if (isStandalone || !showInstallBanner) return null;

  return (
    <div className="no-print fixed bottom-20 lg:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-surface/95 backdrop-blur-md border border-border p-4 rounded-2xl shadow-xl flex items-start gap-3 text-text">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
          <Download size={20} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-text">Instalar PsiSetting</h4>
            <button
              onClick={handleDismiss}
              className="text-text-muted hover:text-text p-1 -mr-1 rounded-lg transition-colors cursor-pointer"
              aria-label="Fechar banner de instalação"
            >
              <X size={15} />
            </button>
          </div>

          <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
            {isIos
              ? "Instale no seu iPhone/iPad: Toque em Compartilhar e depois em 'Adicionar à Tela de Início'."
              : "Instale o app para acesso rápido e tela cheia, sem barra de navegador."}
          </p>

          {isIos ? (
            <div className="mt-2.5 flex items-center gap-2 text-[10.5px] font-medium text-primary bg-primary/5 px-2.5 py-1.5 rounded-lg border border-primary/10">
              <span className="inline-flex items-center gap-1">
                <Share size={12} /> 1º Compartilhar
              </span>
              <span>→</span>
              <span className="inline-flex items-center gap-1">
                <PlusSquare size={12} /> 2º Tela de Início
              </span>
            </div>
          ) : (
            <button
              onClick={handleInstallClick}
              className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-all cursor-pointer shadow-xs"
            >
              <Download size={13} />
              <span>Instalar Aplicativo</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

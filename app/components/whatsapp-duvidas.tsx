"use client";

import { useEffect, useState } from "react";
import { linkWhatsAppDuvidas } from "@/utils/contato";

/** Quanto rolar, no celular, até o botão aparecer: passa dos botões do topo. */
const ROLAGEM_PARA_MOSTRAR = 240;

/**
 * "Ficou com dúvidas?": atalho fixo no canto da tela para conversar com o
 * PsiSetting no WhatsApp. Só no site institucional (landing, termos e
 * privacidade) — nunca dentro do sistema, onde o WhatsApp que importa é o do
 * paciente (botao-whatsapp.tsx) e um segundo botão verde confundiria.
 *
 * - No celular fica compacto ("Dúvidas?") e só aparece depois que a pessoa
 *   rola um pouco: na primeira tela ele cobria o botão "Ver Demonstração".
 *   Invisível (visibility), ele também sai da ordem do Tab. No computador
 *   aparece sempre — lá sobra espaço no canto.
 * - z-40: abaixo do menu do topo (z-50), que abre por cima dele no celular.
 * - O env() soma a barra de gestos do iPhone quando o navegador a informa;
 *   onde não informa, vale 0 e sobra só a margem.
 * - A entrada é CSS (.ps-whatsapp-in em globals.css), com atraso para não
 *   disputar atenção com o título, e parada para quem pede menos movimento.
 */
export function WhatsAppDuvidas() {
  const [rolou, setRolou] = useState(false);

  useEffect(() => {
    const conferir = () => setRolou(window.scrollY > ROLAGEM_PARA_MOSTRAR);
    conferir();
    window.addEventListener("scroll", conferir, { passive: true });
    return () => window.removeEventListener("scroll", conferir);
  }, []);

  return (
    <a
      href={linkWhatsAppDuvidas()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Ficou com dúvidas? Nos chame no WhatsApp (abre uma conversa com o PsiSetting em nova aba)"
      className={`ps-whatsapp-in fixed z-40 right-4 bottom-[calc(1rem_+_env(safe-area-inset-bottom))]
                 sm:right-6 sm:bottom-[calc(1.5rem_+_env(safe-area-inset-bottom))]
                 inline-flex items-center gap-2 rounded-full bg-surface border border-border
                 pl-3 pr-4 py-2.5 sm:pl-3.5 sm:pr-5 sm:py-3 text-sm font-semibold text-text
                 shadow-[0_8px_28px_-6px_rgba(44,30,23,0.22)] hover:border-[#25D366]/50
                 hover:shadow-[0_12px_32px_-6px_rgba(44,30,23,0.28)] active:scale-[0.98] no-print
                 transition-[opacity,transform,visibility] duration-300 motion-reduce:transition-none
                 ${rolou ? "" : "max-sm:invisible max-sm:opacity-0 max-sm:translate-y-3"}`}
    >
      <IconeWhatsApp className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 text-[#25D366]" />
      <span className="sm:hidden">Dúvidas?</span>
      <span className="hidden sm:inline">Ficou com dúvidas? Nos chame no WhatsApp</span>
    </a>
  );
}

// O lucide não tem o logo do WhatsApp (marcas ficam de fora da biblioteca).
// Traçado do Simple Icons, domínio público.
function IconeWhatsApp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

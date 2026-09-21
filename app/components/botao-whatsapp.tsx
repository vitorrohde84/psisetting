"use client";

import type { MouseEvent } from "react";
import { MessageCircle } from "lucide-react";
import { linkWhatsApp } from "@/utils/whatsapp";

/**
 * Abre a conversa com o paciente no WhatsApp, em branco. Sem mensagem pronta:
 * texto automático que passa pelo WhatsApp nunca deve levar nada clínico, e
 * cada profissional tem o seu jeito de escrever.
 *
 * É um <button>, não um <a href>: um link mostraria "wa.me/55…" no rodapé do
 * navegador ao passar o mouse, expondo o número com o Modo Privacidade ligado.
 * Pelo mesmo motivo, não pode ficar dentro de um elemento .sensitive-data —
 * lá ele seria desfocado e deixaria de receber clique justamente no Modo
 * Privacidade.
 *
 * Sem telefone válido, não renderiza nada.
 */
export function BotaoWhatsApp({
  telefone,
  comRotulo = false,
}: {
  telefone: string | null | undefined;
  comRotulo?: boolean;
}) {
  const link = linkWhatsApp(telefone);
  if (!link) return null;

  const abrir = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    window.open(link, "_blank", "noopener,noreferrer");
  };

  if (comRotulo) {
    return (
      <button
        type="button"
        onClick={abrir}
        title="Abrir conversa no WhatsApp"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 border border-transparent text-sm font-medium text-white
                   hover:bg-emerald-700 active:scale-[0.98] transition-all duration-200 cursor-pointer shrink-0"
      >
        <MessageCircle size={15} />
        <span>WhatsApp</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={abrir}
      title="Abrir conversa no WhatsApp"
      aria-label="Abrir conversa no WhatsApp"
      className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-emerald-600
                 hover:bg-emerald-50 hover:text-emerald-700 transition-colors cursor-pointer shrink-0"
    >
      <MessageCircle size={15} />
    </button>
  );
}

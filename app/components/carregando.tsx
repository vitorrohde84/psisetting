"use client";

import { useEffect, useState } from "react";
import { frasesDoCarregamento } from "@/utils/carregando-frases";

/**
 * Carregamento de tela e de seção: uma xícara de chá com o vapor subindo.
 *
 * Só para esperas de conteúdo. Spinners pequenos dentro de botões
 * ("Salvando…", "Excluindo…") continuam com o Loader2 — uma animação desta
 * escala dentro de um botão pareceria fora de lugar.
 *
 * A animação é só CSS (.ps-cha-vapor em globals.css), com transform e opacity,
 * e tem versão calma para quem pede movimento reduzido ao sistema.
 */

const INTERVALO_MS = 2800;

interface CarregandoProps {
  /** O que está carregando, ex.: "Carregando prontuário…". É a primeira frase exibida. */
  mensagem?: string;
  /** A tela abre dado clínico cifrado com a chave do psicólogo. */
  dadosClinicos?: boolean;
  tamanho?: "md" | "sm";
  className?: string;
}

export function Carregando({
  mensagem,
  dadosClinicos = false,
  tamanho = "md",
  className = "",
}: CarregandoProps) {
  const frases = frasesDoCarregamento(mensagem, dadosClinicos);
  const [indice, setIndice] = useState(0);
  const [fraseVisivel, setFraseVisivel] = useState(true);

  useEffect(() => {
    let troca: number | undefined;
    const intervalo = window.setInterval(() => {
      setFraseVisivel(false);
      troca = window.setTimeout(() => {
        setIndice((atual) => (atual + 1) % frases.length);
        setFraseVisivel(true);
      }, 300);
    }, INTERVALO_MS);
    return () => {
      window.clearInterval(intervalo);
      window.clearTimeout(troca);
    };
  }, [frases.length]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
    >
      <svg
        viewBox="0 0 80 80"
        aria-hidden="true"
        className={tamanho === "sm" ? "w-14 h-14" : "w-20 h-20"}
      >
        <path className="ps-cha-vapor" d="M31 40 C27 34 35 30 31 24 C27 18 35 14 31 8" />
        <path
          className="ps-cha-vapor"
          style={{ animationDelay: "0.9s" }}
          d="M40 40 C36 34 44 30 40 24 C36 18 44 14 40 8"
        />
        <path
          className="ps-cha-vapor"
          style={{ animationDelay: "1.8s" }}
          d="M49 40 C45 34 53 30 49 24 C45 18 53 14 49 8"
        />
        <path
          d="M57 49 C65 49 66 58 58 59"
          fill="none"
          className="stroke-primary"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <path
          d="M22 45 L58 45 L55 61 C54 65 51 67 47 67 L33 67 C29 67 26 65 25 61 Z"
          className="fill-primary"
        />
        <path d="M16 71 L64 71" className="stroke-secondary" strokeWidth={3} strokeLinecap="round" />
      </svg>

      <p
        aria-hidden="true"
        className={`text-text-muted transition-opacity duration-300 motion-reduce:transition-none ${
          tamanho === "sm" ? "text-xs" : "text-sm"
        } ${fraseVisivel ? "opacity-100" : "opacity-0"}`}
      >
        {frases[indice]}
      </p>
      <span className="sr-only">{mensagem ?? "Carregando"}</span>
    </div>
  );
}

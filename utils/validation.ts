/**
 * Validações de entrada nas bordas. A21 da auditoria de 17/09/2026.
 *
 * O projeto não tem biblioteca de schema, e nenhuma das 20 rotas validava
 * formato. Estas funções cobrem os casos em que a falta de validação vira
 * problema de segurança, não só de robustez.
 */

/**
 * Aceita apenas http(s). Devolve a URL normalizada ou null.
 *
 * Existe porque `link_url` de comunicado vira `href` na barra superior de
 * TODOS os psicólogos: um `javascript:` ali é XSS distribuído para a base
 * inteira a partir do painel admin.
 */
export function validarLinkExterno(valor: unknown): string | null {
  if (typeof valor !== "string") return null;

  const limpo = valor.trim();
  if (!limpo) return null;
  if (limpo.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(limpo);
  } catch {
    return null;
  }

  // Allowlist. Bloquear "javascript:" por lista negra falha com variações como
  // "java\tscript:" — só o protocolo explicitamente permitido passa.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  return url.toString();
}

/**
 * Inteiro dentro de uma faixa, ou null.
 *
 * `Number("abc") ?? 7` devolve NaN, não 7 — o `??` só cobre null e undefined.
 * Era assim que um "days" inválido virava `Invalid Date` no painel admin.
 */
export function inteiroNaFaixa(
  valor: unknown,
  min: number,
  max: number
): number | null {
  const n = Number(valor);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

/** Texto obrigatório com limite de tamanho. */
export function textoLimitado(
  valor: unknown,
  maxLength: number
): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo || limpo.length > maxLength) return null;
  return limpo;
}

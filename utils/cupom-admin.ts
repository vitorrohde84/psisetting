import { PRECO_BASE, PRECO_MINIMO } from "./preco-desconto";

/**
 * Validação do cupom criado pelo admin — funções puras, testáveis.
 *
 * A rota aceitava o corpo quase cru: `Number(discount_value) || ...`, percentual
 * acima de 100, desconto fixo maior que o preço, e a validade vinda de um
 * <input type="date"> ("2026-10-31") virava meia-noite UTC — 21h do dia 30 em
 * Brasília. O cupom vencia um dia antes do que o admin escolheu.
 */

export type TipoCupom = "trial_days" | "percent" | "fixed" | "vip";

export interface NovoCupom {
  code: string;
  discount_type: TipoCupom;
  discount_value: number;
  trial_days: number;
  duracao_meses: number | null;
  para_sempre: boolean;
  max_uses: number | null;
  expires_at: string | null;
  uses_count: 0;
  active: true;
}

export type Validacao<T> = { ok: true; valor: T } | { ok: false; erro: string };

const TIPOS: TipoCupom[] = ["trial_days", "percent", "fixed", "vip"];
const CODIGO = /^[A-Z0-9_-]{3,30}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Maior desconto fixo que ainda deixa o preço no piso de R$ 1,00. */
export const DESCONTO_FIXO_MAXIMO = Math.round((PRECO_BASE - PRECO_MINIMO) * 100) / 100;

/**
 * "2026-10-31" → fim desse dia em Brasília. Devolve null para vazio e erro
 * para data inválida ou já passada.
 */
export function fimDoDiaEmBrasilia(
  valor: unknown,
  agora = new Date()
): Validacao<string | null> {
  if (valor === null || valor === undefined || valor === "") return { ok: true, valor: null };
  if (typeof valor !== "string" || !DATA.test(valor)) {
    return { ok: false, erro: "Data de validade inválida." };
  }

  const fim = new Date(`${valor}T23:59:59-03:00`);
  if (Number.isNaN(fim.getTime())) return { ok: false, erro: "Data de validade inválida." };
  if (fim.getTime() < agora.getTime()) {
    return { ok: false, erro: "A data de validade já passou." };
  }
  return { ok: true, valor: fim.toISOString() };
}

export function validarLimiteDeUsos(valor: unknown): Validacao<number | null> {
  if (valor === null || valor === undefined || valor === "") return { ok: true, valor: null };
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > 100000) {
    return { ok: false, erro: "Limite de usos deve ser um número inteiro entre 1 e 100.000." };
  }
  return { ok: true, valor: n };
}

export function validarNovoCupom(corpo: unknown, agora = new Date()): Validacao<NovoCupom> {
  const b = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;

  const code = String(b.code ?? "").trim().toUpperCase();
  if (!CODIGO.test(code)) {
    return {
      ok: false,
      erro: "Código do cupom: de 3 a 30 caracteres, só letras, números, hífen e sublinhado.",
    };
  }

  const tipo = b.discount_type as TipoCupom;
  if (!TIPOS.includes(tipo)) return { ok: false, erro: "Tipo de cupom inválido." };

  const valor = Number(b.discount_value);
  let discount_value = 0;
  let trial_days = 30;

  if (tipo === "percent") {
    if (!Number.isInteger(valor) || valor < 1 || valor > 100) {
      return { ok: false, erro: "Desconto em %: número inteiro de 1 a 100." };
    }
    discount_value = valor;
  } else if (tipo === "fixed") {
    const centavos = Math.round(valor * 100);
    if (!Number.isFinite(valor) || centavos < 1 || centavos / 100 > DESCONTO_FIXO_MAXIMO) {
      return {
        ok: false,
        erro: `Desconto em R$: de R$ 0,01 a R$ ${DESCONTO_FIXO_MAXIMO.toFixed(2).replace(".", ",")}.`,
      };
    }
    discount_value = centavos / 100;
  } else if (tipo === "trial_days") {
    if (!Number.isInteger(valor) || valor < 1 || valor > 365) {
      return { ok: false, erro: "Dias de teste: número inteiro de 1 a 365." };
    }
    discount_value = valor;
    trial_days = valor;
  }

  // Duração só existe para desconto. Dias de teste e VIP são concedidos na
  // hora e ficam com 1, o padrão do banco.
  let duracao_meses: number | null = 1;
  let para_sempre = false;

  if (tipo === "percent" || tipo === "fixed") {
    if (b.para_sempre === true) {
      duracao_meses = null;
      para_sempre = true;
    } else {
      const meses = Number(b.duracao_meses ?? 1);
      if (!Number.isInteger(meses) || meses < 1 || meses > 120) {
        return { ok: false, erro: "Duração: de 1 a 120 meses, ou para sempre." };
      }
      duracao_meses = meses;
    }
  }

  const limite = validarLimiteDeUsos(b.max_uses);
  if (!limite.ok) return limite;

  const validade = fimDoDiaEmBrasilia(b.expires_at, agora);
  if (!validade.ok) return validade;

  return {
    ok: true,
    valor: {
      code,
      discount_type: tipo,
      discount_value,
      trial_days,
      duracao_meses,
      para_sempre,
      max_uses: limite.valor,
      expires_at: validade.valor,
      uses_count: 0,
      active: true,
    },
  };
}

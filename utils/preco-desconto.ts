/**
 * Contas e textos do desconto de cupom — funções puras, usadas no servidor e
 * nas telas.
 *
 * Existe para que o valor exibido e o valor cobrado saiam da MESMA conta.
 * Antes, o modal, o painel admin, as métricas e três rotas de pagamento
 * calculavam cada um o seu desconto; a rota do PIX chegou a ignorar o cupom
 * enquanto a tela mostrava o preço com desconto.
 */

export const PRECO_BASE = 34.9;

/** Piso de cobrança: o Mercado Pago não cobra zero, e 100% OFF vira R$ 1,00. */
export const PRECO_MINIMO = 1;

export type TipoDesconto = "percent" | "fixed";

export function ehTipoDesconto(tipo: unknown): tipo is TipoDesconto {
  return tipo === "percent" || tipo === "fixed";
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function aplicarDesconto(
  base: number,
  tipo: TipoDesconto,
  valor: number
): number {
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return arredondar(base);

  const desconto = tipo === "percent" ? (base * v) / 100 : v;
  return arredondar(Math.max(PRECO_MINIMO, base - desconto));
}

/** 27.92 → "27,92" */
export function formatarReais(valor: number): string {
  return arredondar(valor).toFixed(2).replace(".", ",");
}

/** "20% OFF" ou "R$ 5,00 OFF" */
export function descreverDesconto(tipo: TipoDesconto, valor: number): string {
  return tipo === "percent"
    ? `${Number(valor)}% OFF`
    : `R$ ${formatarReais(Number(valor))} OFF`;
}

/**
 * Quantas mensalidades com desconto ainda restam.
 * null = para sempre. Os meses contam MENSALIDADES PAGAS com desconto, não
 * meses de calendário: quem paga por PIX e pula um mês não perde o benefício.
 */
export function mensalidadesRestantes(
  duracaoMeses: number | null,
  usadas: number
): number | null {
  if (duracaoMeses === null) return null;
  return Math.max(0, duracaoMeses - Math.max(0, usadas));
}

/** Como o admin lê a duração de um cupom. */
export function descreverDuracaoCupom(duracaoMeses: number | null): string {
  if (duracaoMeses === null) return "para sempre";
  if (duracaoMeses === 1) return "só na 1ª mensalidade";
  return `por ${duracaoMeses} meses`;
}

/**
 * Frase de preço que o psicólogo lê antes de pagar.
 *
 * `novo` = cupom que ele acabou de digitar (conta desde a 1ª mensalidade);
 * senão é um cupom que ele já usa, e o texto fala do que falta.
 */
export function descreverPrecoComDesconto({
  valorFinal,
  restantes,
  novo,
  base = PRECO_BASE,
}: {
  valorFinal: number;
  restantes: number | null;
  novo: boolean;
  base?: number;
}): string {
  const final = `R$ ${formatarReais(valorFinal)}`;
  const cheio = `R$ ${formatarReais(base)}/mês`;

  if (restantes === null) return `${final}/mês, todo mês`;

  if (restantes <= 1) {
    return novo
      ? `${final} na 1ª mensalidade, depois ${cheio}`
      : `${final} nesta mensalidade, depois ${cheio}`;
  }

  return novo
    ? `${final}/mês nos ${restantes} primeiros meses, depois ${cheio}`
    : `${final}/mês por mais ${restantes} mensalidades, depois ${cheio}`;
}

/**
 * Validade do QR Code do PIX — as contas, sem acesso a rede (a tela também usa).
 *
 * Pedido de 23/09/2026: o QR vale 15 minutos. O Mercado Pago não aceita menos
 * de 30 em date_of_expiration ("entre 30 minutos até 30 dias a partir da data
 * de emissão"), então são três relógios:
 *  - no Mercado Pago o pagamento nasce com 32 min (o mínimo, mais folga para o
 *    pedido chegar lá);
 *  - a tela conta 15 min a partir da criação;
 *  - passados 15 min e mais 1 de folga (relógio do celular adiantado, consulta
 *    que chegou atrasada), o servidor CANCELA o pagamento no Mercado Pago, e o
 *    banco deixa de aceitar o QR. Sem o cancelamento, o "expirou" da tela seria
 *    só aparência: o QR copiado continuaria pagável por mais 17 minutos.
 */

export const VALIDADE_PIX_MIN = 15;
export const VALIDADE_PIX_MERCADO_PAGO_MIN = 32;
export const FOLGA_CANCELAMENTO_PIX_MS = 60_000;

const MINUTO_MS = 60_000;

function paraData(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** date_of_expiration no formato que o Mercado Pago pede, no fuso de Brasília (sem horário de verão desde 2019). */
export function expiracaoPixMercadoPago(agora = new Date()): string {
  const brasilia = new Date(agora.getTime() + VALIDADE_PIX_MERCADO_PAGO_MIN * MINUTO_MS - 3 * 60 * MINUTO_MS);
  return brasilia.toISOString().replace("Z", "-03:00");
}

/** Até quando o QR vale para a pessoa: criação + 15 min. Sem data de criação, conta de agora. */
export function fimDaValidadePix(criadoEm: string | Date | null | undefined, agora = new Date()): Date {
  const inicio = paraData(criadoEm) ?? agora;
  return new Date(inicio.getTime() + VALIDADE_PIX_MIN * MINUTO_MS);
}

/**
 * Segundos que faltam, para a tela contar a partir do relógio DELA: o servidor
 * manda a duração, não o horário, e um celular com a hora errada ainda conta
 * os 15 minutos certos.
 */
export function segundosRestantesPix(criadoEm: string | Date | null | undefined, agora = new Date()): number {
  const fim = fimDaValidadePix(criadoEm, agora);
  return Math.max(0, Math.ceil((fim.getTime() - agora.getTime()) / 1000));
}

/**
 * Já passou da hora de cancelar no Mercado Pago? Sem data de criação confiável,
 * não cancela: cancelar um PIX que a pessoa ainda está pagando é pior do que
 * deixar o Mercado Pago vencê-lo sozinho em 32 minutos.
 */
export function pixDeveSerCancelado(criadoEm: string | Date | null | undefined, agora = new Date()): boolean {
  const inicio = paraData(criadoEm);
  if (!inicio) return false;
  return agora.getTime() > fimDaValidadePix(inicio).getTime() + FOLGA_CANCELAMENTO_PIX_MS;
}

/** "14:05" — minutos e segundos da contagem da tela. */
export function formatarContagemPix(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

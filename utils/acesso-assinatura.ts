/**
 * Quem tem acesso ao sistema — decidido pelas DATAS, nunca pelo status gravado.
 *
 * Antes, /api/subscription/status fazia
 *     hasActiveSubscription = isVip || status === "active" || isPeriodActive
 * e só entrava em somente leitura quem estava com status "trialing" e teste
 * vencido. Dois efeitos:
 *   - quem pagou UMA vez ficava ativo para sempre: nada volta o status quando
 *     os 30 dias acabam;
 *   - conta "canceled", "past_due" ou "expired" (inclusive a do botão
 *     "Expirar teste" do admin) tinha acesso total, porque não era "trialing".
 *
 * subscription_status continua sendo gravado, como informação. Quem decide o
 * acesso é esta função, e ela é a mesma para a tela, o painel admin e as
 * métricas — antes cada um classificava de um jeito.
 */

export type SituacaoAcesso = "vip" | "ativo" | "teste" | "vencido";

export interface EntradaAcesso {
  isVip: boolean | null | undefined;
  trialEndsAt: string | Date | null | undefined;
  currentPeriodEnd: string | Date | null | undefined;
  agora?: Date;
}

export interface ResultadoAcesso {
  situacao: SituacaoAcesso;
  /** Pode criar e editar registros. */
  temAcesso: boolean;
  somenteLeitura: boolean;
  /** Dias até o fim do teste gratuito (0 fora do teste). */
  diasRestantesTeste: number;
  /** Dias até o fim do acesso de quem paga (null fora de "ativo"). */
  diasParaVencer: number | null;
  /**
   * Até quando o acesso vai, de fato: o maior entre período pago e teste. Um
   * cupom de dias de teste usado por quem já pagou pode terminar DEPOIS do
   * período pago — aí o aviso de vencimento e o "Ativo até" usam esta data.
   */
  acessoAte: string | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;

function paraData(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diasAte(fim: Date, agora: Date): number {
  return Math.max(0, Math.ceil((fim.getTime() - agora.getTime()) / DIA_MS));
}

export function calcularAcesso({
  isVip,
  trialEndsAt,
  currentPeriodEnd,
  agora = new Date(),
}: EntradaAcesso): ResultadoAcesso {
  if (isVip) {
    return {
      situacao: "vip",
      temAcesso: true,
      somenteLeitura: false,
      diasRestantesTeste: 0,
      diasParaVencer: null,
      acessoAte: null,
    };
  }

  // O período pago vem antes do teste: quem pagou aparece como assinante, não
  // como "teste", mesmo que ainda tenha dias de teste por cupom.
  const fimPago = paraData(currentPeriodEnd);
  const fimTeste = paraData(trialEndsAt);

  if (fimPago && fimPago > agora) {
    const fim = fimTeste && fimTeste > fimPago ? fimTeste : fimPago;
    return {
      situacao: "ativo",
      temAcesso: true,
      somenteLeitura: false,
      diasRestantesTeste: 0,
      diasParaVencer: diasAte(fim, agora),
      acessoAte: fim.toISOString(),
    };
  }

  if (fimTeste && fimTeste > agora) {
    return {
      situacao: "teste",
      temAcesso: true,
      somenteLeitura: false,
      diasRestantesTeste: diasAte(fimTeste, agora),
      diasParaVencer: null,
      acessoAte: fimTeste.toISOString(),
    };
  }

  return {
    situacao: "vencido",
    temAcesso: false,
    somenteLeitura: true,
    diasRestantesTeste: 0,
    diasParaVencer: null,
    acessoAte: null,
  };
}

/** Quantos dias antes do vencimento o sistema começa a avisar quem paga mês a mês. */
export const DIAS_AVISO_VENCIMENTO = 5;

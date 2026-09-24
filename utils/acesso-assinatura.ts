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
  /**
   * Renovação automática no cartão ligada (assinatura ativa no Mercado Pago).
   * Dá a tolerância de CARENCIA_CARTAO_DIAS depois do período pago: a
   * cobrança do mês pode sair horas depois do fim do período, e um cartão
   * recusado é tentado de novo por até 10 dias.
   */
  renovacaoAutomatica?: boolean;
  /**
   * Quando a renovação foi ligada. A tolerância só vale se ela já existia
   * quando os dias da pessoa acabaram: quem liga o automático já vencido
   * espera a primeira cobrança ser aprovada — senão ganharia até 10 dias de
   * acesso sem pagar, e a tela leria isso como "cobrança aprovada".
   */
  renovacaoDesde?: string | Date | null;
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
  /**
   * Período pago já acabou e o acesso segue pela tolerância da renovação
   * automática (a cobrança do mês ainda não foi aprovada).
   */
  emCarencia: boolean;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Dias de acesso depois do fim do período pago enquanto a renovação
 * automática está ligada. Decisão de 23/09/2026: 10 dias, a janela em que o
 * Mercado Pago tenta de novo um cartão recusado (até 4 tentativas).
 */
export const CARENCIA_CARTAO_DIAS = 10;

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
  renovacaoAutomatica = false,
  renovacaoDesde = null,
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
      emCarencia: false,
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
      emCarencia: false,
    };
  }

  // Renovação automática ligada e a cobrança ainda não foi aprovada: o acesso
  // segue até a tolerância acabar, contada do fim dos dias que a pessoa tinha —
  // pagos ou de teste. Quem liga o automático no teste grátis tem a primeira
  // cobrança no fim do teste, e ela também pode sair horas depois ou ser
  // recusada e tentada de novo.
  const fimDosDias = [fimPago, fimTeste]
    .filter((d): d is Date => d !== null)
    .reduce<Date | null>((maior, d) => (!maior || d > maior ? d : maior), null);
  const desde = paraData(renovacaoDesde);
  if (renovacaoAutomatica && desde && fimDosDias && desde <= fimDosDias && fimDosDias <= agora) {
    const fimCarencia = new Date(fimDosDias.getTime() + CARENCIA_CARTAO_DIAS * DIA_MS);
    if (fimCarencia > agora) {
      return {
        situacao: "ativo",
        temAcesso: true,
        somenteLeitura: false,
        diasRestantesTeste: 0,
        diasParaVencer: diasAte(fimCarencia, agora),
        acessoAte: fimCarencia.toISOString(),
        emCarencia: true,
      };
    }
  }

  if (fimTeste && fimTeste > agora) {
    return {
      situacao: "teste",
      temAcesso: true,
      somenteLeitura: false,
      diasRestantesTeste: diasAte(fimTeste, agora),
      diasParaVencer: null,
      acessoAte: fimTeste.toISOString(),
      emCarencia: false,
    };
  }

  return {
    situacao: "vencido",
    temAcesso: false,
    somenteLeitura: true,
    diasRestantesTeste: 0,
    diasParaVencer: null,
    acessoAte: null,
    emCarencia: false,
  };
}

/** Quantos dias antes do vencimento o sistema começa a avisar quem paga mês a mês. */
export const DIAS_AVISO_VENCIMENTO = 5;

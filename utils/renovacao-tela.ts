import type { SituacaoAcesso } from "./acesso-assinatura";
import { inicioDaCobranca, type RenovacaoTela } from "./assinatura-cartao";
import { dataCurta, descreverCartao, type PrecoTela } from "./assinatura-tela";
import { formatarReais } from "./preco-desconto";

/**
 * O que o modal de assinatura diz sobre o cartão com renovação automática —
 * funções puras, testadas em tests/renovacao-tela.test.ts.
 *
 * Ficam fora do componente pelo mesmo motivo de utils/assinatura-tela.ts: são
 * frases sobre DINHEIRO e DATA de cobrança. "R$ 27,92 todo mês" para um
 * desconto que acaba no 3º mês, ou "cobramos hoje" para quem ainda está no
 * teste, geram estorno pedido e confiança perdida.
 *
 * O valor nunca é calculado aqui: vem do servidor (PrecoTela, RenovacaoTela).
 */

/** Como a pessoa escolheu pagar no cartão. */
export type ModoCartao = "automatico" | "avulso";

function reais(valor: number): string {
  return `R$ ${formatarReais(valor)}`;
}

/** Desconto que acaba depois de N mensalidades: o valor da tela não se repete para sempre. */
function descontoLimitado(preco: PrecoTela): boolean {
  const d = preco.desconto;
  return Boolean(d && !d.paraSempre && d.restantes !== null);
}

/**
 * A linha do "Automático". Com desconto por tempo limitado, vale a frase do
 * servidor ("R$ 27,92/mês nos 3 primeiros meses, depois R$ 34,90/mês"): a
 * subida para o preço cheio é automática, e a pessoa precisa saber disso antes
 * de ligar.
 */
export function cobrancaAutomatica(preco: PrecoTela): string {
  const d = preco.desconto;
  const quanto =
    d && descontoLimitado(preco)
      ? `Cobramos no seu cartão ${d.frase}.`
      : `Cobramos ${reais(preco.valor)} todo mês no seu cartão.`;
  return `${quanto} Cancele quando quiser em Configurações.`;
}

/**
 * Quando sai a primeira cobrança, pela mesma regra do servidor
 * (inicioDaCobranca): quem tem dias pela frente, de teste ou pagos, só é
 * cobrado quando eles acabam. É uma previsão — a data confirmada vem na
 * resposta de /api/subscription/automatica.
 */
export function inicioDaCobrancaNaTela({
  currentPeriodEnd,
  trialEndsAt,
  agora = new Date(),
}: {
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  agora?: Date;
}): string {
  const inicio = inicioDaCobranca({ currentPeriodEnd, trialEndsAt, agora });
  const data = dataCurta(inicio);
  if (!inicio || !data) return "A primeira cobrança sai logo depois que você confirmar.";

  const fimTeste = trialEndsAt ? new Date(trialEndsAt).getTime() : NaN;
  const quando = fimTeste === inicio.getTime() ? "quando o seu teste grátis acabar" : "quando os seus dias já pagos acabarem";
  return `Nada é cobrado agora: a primeira cobrança sai em ${data}, ${quando}.`;
}

/**
 * Cobrança de validação que o Mercado Pago pode fazer ao criar a assinatura
 * (ver ehValidacaoDeCartao). Sem o aviso, um valor estranho na fatura parece
 * cobrança indevida.
 */
export const AVISO_VALIDACAO_CARTAO =
  "O Mercado Pago pode fazer uma cobrança de valor baixo para conferir o cartão; ela é estornada em seguida.";

export const TEXTO_MES_A_MES =
  "Pagamento de 30 dias. No mês seguinte você renova por aqui, e avisamos antes de vencer.";

/**
 * Texto do botão do formulário do cartão. No automático, "/mês" só quando o
 * valor se repete (a mesma regra de resumirValor): com desconto por tempo
 * limitado, o botão diz o valor da 1ª cobrança.
 */
export function textoBotaoCartao(modo: ModoCartao, preco: PrecoTela): string {
  const valor = reais(preco.valor);
  if (modo === "avulso") return `Pagar ${valor} · 30 dias de acesso`;
  return descontoLimitado(preco)
    ? `Ligar renovação · 1ª cobrança ${valor}`
    : `Ligar renovação automática · ${valor}/mês`;
}

export interface MensagemSucesso {
  titulo: string;
  texto: string;
}

/**
 * Tela de sucesso depois de ligar a renovação. primeiraCobranca null = o
 * Mercado Pago cobra em seguida, e o acesso só muda quando ela for aprovada;
 * com data = nada foi cobrado agora.
 */
export function sucessoAutomatico({
  valor,
  primeiraCobranca,
}: {
  valor: number;
  primeiraCobranca: string | null;
}): MensagemSucesso {
  const titulo = "Renovação automática ligada";
  if (!primeiraCobranca) {
    return {
      titulo,
      texto: `A primeira cobrança de ${reais(valor)} sai em alguns minutos; seu acesso é liberado assim que ela for aprovada.`,
    };
  }
  const data = dataCurta(primeiraCobranca);
  return {
    titulo,
    texto: data
      ? `A primeira cobrança, de ${reais(valor)}, será em ${data}. Até lá seu acesso continua normalmente.`
      : `A primeira cobrança, de ${reais(valor)}, sai quando os seus dias atuais acabarem. Até lá seu acesso continua normalmente.`,
  };
}

export interface SituacaoRenovacaoNaTela {
  titulo: string;
  texto: string | null;
  /** "Próxima cobrança: 26/09", "Valor: R$ 27,92", "Cartão: Visa final 1234". */
  detalhes: { rotulo: string; valor: string }[];
  alerta: { tipo: "erro" | "info"; texto: string } | null;
}

/**
 * O que o modal mostra a quem já está no automático (decisão de 23/09/2026:
 * só a situação, sem PIX nem formulário — o servidor também recusa pagar
 * avulso com a renovação ligada).
 *
 * currentPeriodEnd já inclui a tolerância de cartão recusado quando o status
 * vem com emCarencia (app/api/subscription/status).
 */
export function situacaoRenovacao({
  renovacao,
  situacao,
  currentPeriodEnd,
  emCarencia,
}: {
  renovacao: RenovacaoTela;
  situacao: SituacaoAcesso;
  currentPeriodEnd: string | null;
  emCarencia: boolean;
}): SituacaoRenovacaoNaTela {
  // Sem bandeira nem final, "Cartão" sozinho não diz nada: a linha sai.
  const cartao =
    renovacao.cartaoBandeira || renovacao.cartaoFinal
      ? descreverCartao(renovacao.cartaoBandeira, renovacao.cartaoFinal)
      : null;

  if (renovacao.situacao !== "ativa") {
    return {
      titulo: "Confirmando sua renovação automática",
      texto: "Estamos confirmando sua renovação automática com o Mercado Pago. Isso leva alguns minutos.",
      detalhes: cartao ? [{ rotulo: "Cartão", valor: cartao }] : [],
      alerta: null,
    };
  }

  const detalhes: SituacaoRenovacaoNaTela["detalhes"] = [];
  const proxima = dataCurta(renovacao.proximaCobranca ?? renovacao.primeiraCobranca);
  if (proxima) detalhes.push({ rotulo: "Próxima cobrança", valor: proxima });
  if (renovacao.valor !== null) detalhes.push({ rotulo: "Valor", valor: reais(renovacao.valor) });
  if (cartao) detalhes.push({ rotulo: "Cartão", valor: cartao });

  const bloqueado = situacao === "vencido";
  let alerta: SituacaoRenovacaoNaTela["alerta"] = null;
  if (renovacao.cobrancaRecusada) {
    const ate = dataCurta(currentPeriodEnd);
    alerta = {
      tipo: "erro",
      texto: bloqueado
        ? "Não conseguimos cobrar seu cartão, e seu acesso está em modo somente leitura. O Mercado Pago ainda tenta de novo nos próximos dias; para pagar por PIX agora, cancele a renovação em Configurações."
        : `Não conseguimos cobrar seu cartão. O Mercado Pago tenta de novo nos próximos dias; seu acesso continua ${ate ? `até ${ate}` : "por enquanto"}. Para pagar por PIX, cancele a renovação em Configurações.`,
    };
  } else if (bloqueado) {
    // Teste acabou e a primeira cobrança ainda não entrou (o Mercado Pago
    // cobra em até algumas horas): sem isto, parece que ligar não adiantou.
    alerta = {
      tipo: "info",
      texto: "A cobrança deste mês ainda não foi aprovada. Assim que ela for, seu acesso é liberado sozinho.",
    };
  } else if (emCarencia) {
    alerta = {
      tipo: "info",
      texto: "A cobrança deste mês ainda não foi confirmada pelo Mercado Pago. Seu acesso continua normalmente enquanto isso.",
    };
  }

  return {
    titulo: "Renovação automática ligada",
    texto: "Cobramos todo mês no seu cartão; você não precisa fazer nada para renovar.",
    detalhes,
    alerta,
  };
}

import type { PrecoParaTela } from "./preco-assinatura";
import { DIAS_AVISO_VENCIMENTO, type SituacaoAcesso } from "./acesso-assinatura";
import { formatarReais } from "./preco-desconto";

/**
 * O que as telas de assinatura dizem ao psicólogo — funções puras, usadas pelo
 * modal, pela faixa do topo e pelo contexto de assinatura.
 *
 * Ficam aqui, fora dos componentes, porque são frases sobre DINHEIRO e PRAZO:
 * "R$ 27,92 na 1ª mensalidade" ou "vence amanhã" errados geram cobrança
 * contestada ou gente bloqueada de surpresa, e isso precisa de teste
 * (tests/assinatura-tela.test.ts) sem abrir navegador.
 *
 * O preço em si NUNCA é calculado aqui: vem pronto do servidor
 * (utils/preco-assinatura.ts → precoParaTela). Aqui só se escolhe como dizê-lo.
 */

export type PrecoTela = PrecoParaTela;

/**
 * Confere o formato do preço que veio de /api/subscription/preco,
 * /api/coupons/apply ou de um 409 das rotas de pagamento. Resposta estranha
 * vira null — melhor a tela dizer "não consegui carregar o preço" do que
 * mostrar um número que não será o cobrado.
 */
export function lerPreco(dado: unknown): PrecoTela | null {
  if (!dado || typeof dado !== "object") return null;
  const p = dado as Record<string, unknown>;
  if (typeof p.valor !== "number" || !Number.isFinite(p.valor)) return null;
  if (typeof p.base !== "number" || !Number.isFinite(p.base)) return null;

  const d = p.desconto as Record<string, unknown> | null | undefined;
  if (d && (typeof d.codigo !== "string" || typeof d.frase !== "string")) return null;

  return dado as PrecoTela;
}

/**
 * O valor que vai no botão principal, entre parênteses.
 *
 * O "/mês" só aparece quando o valor se repete: com desconto só na 1ª
 * mensalidade, "R$ 27,92/mês" prometeria um preço que não vale no mês seguinte.
 */
export function resumirValor(preco: PrecoTela): string {
  const valor = `R$ ${formatarReais(preco.valor)}`;
  const d = preco.desconto;

  if (!d || d.paraSempre || d.restantes === null) return `${valor}/mês`;

  const novo = d.origem === "cupom_novo";
  if (d.restantes <= 1) {
    return novo ? `${valor} na 1ª mensalidade` : `${valor} nesta mensalidade`;
  }
  return novo
    ? `${valor}/mês por ${d.restantes} meses`
    : `${valor}/mês por mais ${d.restantes} meses`;
}

/** O que acompanha o número grande do quadro de preço ("/mês" ou nada). */
export function sufixoDoValor(preco: PrecoTela): string {
  const d = preco.desconto;
  if (d && !d.paraSempre && d.restantes !== null && d.restantes <= 1) return "";
  return "/mês";
}

/**
 * O pagamento foi recusado por causa do cupom digitado?
 *
 * As rotas de pagamento respondem 400 tanto para cupom que deixou de valer
 * quanto para formulário incompleto do cartão. Só no primeiro caso a tela deve
 * tirar o cupom e recarregar o preço — no segundo, apagar o cupom seria punir
 * a pessoa por um erro que não é dele. As duas mensagens de cupom do servidor
 * (utils/coupons.ts) falam "cupom"; as de formulário, não.
 */
export function ehErroDeCupom(status: number, erro: unknown, enviouCupom: boolean): boolean {
  return enviouCupom && status === 400 && typeof erro === "string" && /cupom/i.test(erro);
}

/**
 * Motivo da recusa do cartão em linguagem de gente.
 *
 * O Mercado Pago devolve "rejected" com HTTP 200 e o motivo em status_detail.
 * Antes a tela mostrava sempre "verifique os dados do cartão" — inclusive
 * quando o banco pedia autorização por telefone, e a pessoa ficava corrigindo
 * dados que estavam certos.
 */
const RECUSAS_CARTAO: Record<string, string> = {
  cc_rejected_bad_filled_card_number: "Confira o número do cartão.",
  cc_rejected_bad_filled_date: "Confira a data de validade do cartão.",
  cc_rejected_bad_filled_security_code: "Confira o código de segurança (CVV) do cartão.",
  cc_rejected_bad_filled_other: "Confira os dados do cartão.",
  cc_rejected_insufficient_amount: "O cartão não tem limite suficiente para este valor.",
  cc_rejected_call_for_authorize:
    "O banco pediu que você autorize este pagamento. Fale com o banco e tente de novo.",
  cc_rejected_card_disabled: "O cartão está bloqueado ou ainda não foi ativado. Fale com o banco.",
  cc_rejected_duplicated_payment:
    "Você acabou de fazer um pagamento igual a este. Se precisa pagar de novo, use outro cartão ou o PIX.",
  cc_rejected_high_risk:
    "O pagamento foi recusado pela análise de segurança. Tente outro cartão ou o PIX.",
  cc_rejected_max_attempts:
    "Você atingiu o limite de tentativas com este cartão. Use outro cartão ou o PIX.",
};

export function mensagemRecusaCartao(statusDetail: unknown): string {
  const motivo =
    typeof statusDetail === "string" && RECUSAS_CARTAO[statusDetail]
      ? RECUSAS_CARTAO[statusDetail]
      : "Confira os dados ou tente outro cartão ou o PIX.";
  return `Pagamento não aprovado. ${motivo}`;
}

/** Dias que um pagamento com o desconto valendo libera. */
const DIAS_DO_PERIODO = 30;

/**
 * Motivos que o banco grava quando o desconto não coube na aprovação
 * (processar_pagamento_aprovado, migração 20260923120000), em linguagem de
 * gente. O texto do banco é para o admin; este é para quem pagou.
 */
const MOTIVOS_DIAS_PARCIAIS: Record<string, string> = {
  "mensalidades com desconto esgotadas": "as mensalidades com desconto do seu cupom já tinham sido usadas",
  "cupom atingiu o limite de usos": "o cupom atingiu o limite de usos antes da confirmação do pagamento",
  "cupom pausado antes da aprovacao": "o cupom foi pausado antes da confirmação do pagamento",
  "desconto encerrado pelo admin": "o desconto do seu cupom foi encerrado antes da confirmação do pagamento",
  "cupom nao encontrado": "o cupom deixou de existir antes da confirmação do pagamento",
  "resgate nao e de desconto": "o cupom que você usa não é de desconto na mensalidade",
};
const MOTIVO_DIAS_PARCIAIS_GENERICO = "o desconto do cupom não pôde ser aplicado na confirmação do pagamento";

export interface Liberacao {
  texto: string;
  /** Menos dias que o período cheio: a tela não fecha sozinha antes de a pessoa ler o porquê. */
  parcial: boolean;
}

/**
 * O que a tela de sucesso diz sobre os dias liberados.
 *
 * Quem decide os dias é o banco, NA APROVAÇÃO: se o desconto do cupom deixou
 * de caber entre gerar o pagamento e o dinheiro entrar, o valor pago vira dias
 * pelo preço cheio (R$ 27,92 viram 24 dias, não 30). A tela dizia "seus 30
 * dias" sempre, e a pessoa descobria a diferença quando o acesso acabava antes
 * da hora.
 *
 * Sem o número (pagamento registrado por outro caminho, resposta antiga), não
 * se inventa um.
 */
export function resumoLiberacao(dias: unknown, observacao: unknown): Liberacao {
  if (typeof dias !== "number" || !Number.isInteger(dias) || dias < 1) {
    return { texto: "Seu acesso foi liberado.", parcial: false };
  }
  if (dias >= DIAS_DO_PERIODO) {
    return { texto: `Seus ${dias} dias de acesso já estão liberados.`, parcial: false };
  }

  const chave = typeof observacao === "string" ? observacao.trim().toLowerCase() : "";
  // Só chave própria: "constructor" e afins não podem virar motivo.
  const motivo = Object.prototype.hasOwnProperty.call(MOTIVOS_DIAS_PARCIAIS, chave)
    ? MOTIVOS_DIAS_PARCIAIS[chave]
    : MOTIVO_DIAS_PARCIAIS_GENERICO;
  return {
    texto: `Foram liberados ${dias} ${dias === 1 ? "dia" : "dias"} de acesso: ${motivo}, então o valor pago virou dias pelo preço cheio.`,
    parcial: true,
  };
}

function paraData(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2026-09-26T13:00:00Z" → "26/09", no fuso de quem está olhando a tela. */
export function dataCurta(valor: string | Date | null | undefined): string | null {
  const d = paraData(valor);
  return d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : null;
}

/** "…T15:42:00-03:00" → "15:42", no fuso de quem está olhando a tela. */
export function horaCurta(valor: string | Date | null | undefined): string | null {
  const d = paraData(valor);
  return d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
}

/**
 * Quantas VIRADAS DE DIA faltam até a data — o que a pessoa entende por
 * "vence em 2 dias". O servidor conta blocos de 24 h arredondados para cima
 * (utils/acesso-assinatura.ts), o que chama de "1 dia" um acesso que acaba
 * hoje às 23 h. Para decidir QUEM vê o aviso vale a conta do servidor; para
 * escrever a frase, esta.
 */
export function diasDeCalendario(fim: Date, agora: Date): number {
  const inicioFim = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  // round, e não floor: dia de horário de verão tem 23 ou 25 horas.
  return Math.max(0, Math.round((inicioFim.getTime() - inicioHoje.getTime()) / (24 * 60 * 60 * 1000)));
}

/** "vence hoje" · "vence amanhã" · "vence em 3 dias" */
export function prazoDeVencimento(dias: number): string {
  if (dias <= 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  return `vence em ${dias} dias`;
}

export interface AvisoVencimento {
  dias: number;
  /** "26/09", ou null se o servidor não mandou a data. */
  data: string | null;
}

/**
 * Deve aparecer o aviso "seu acesso vence em N dias"?
 *
 * Só para quem paga mês a mês: o pagamento é avulso (sem débito automático),
 * então sem aviso a pessoa descobre que venceu quando tenta salvar um
 * prontuário. VIP e teste gratuito têm os próprios avisos.
 */
export function avisoDeVencimento({
  hasActiveSubscription,
  isVip,
  diasParaVencer,
  currentPeriodEnd,
  agora = new Date(),
}: {
  hasActiveSubscription: boolean;
  isVip: boolean;
  diasParaVencer: number | null;
  currentPeriodEnd: string | null;
  agora?: Date;
}): AvisoVencimento | null {
  if (!hasActiveSubscription || isVip) return null;
  if (diasParaVencer === null || diasParaVencer > DIAS_AVISO_VENCIMENTO) return null;

  const fim = paraData(currentPeriodEnd);
  return {
    dias: fim ? diasDeCalendario(fim, agora) : diasParaVencer,
    data: dataCurta(fim),
  };
}

export interface StatusAssinatura {
  isVip: boolean;
  status: string;
  situacao: SituacaoAcesso;
  isTrialing: boolean;
  trialDaysLeft: number;
  trialEndsAt: string | null;
  isReadOnly: boolean;
  hasActiveSubscription: boolean;
  /** Dias até o fim do período pago; null fora de "ativo". */
  diasParaVencer: number | null;
  currentPeriodEnd: string | null;
}

const SITUACOES: readonly SituacaoAcesso[] = ["vip", "ativo", "teste", "vencido"];

/**
 * Resposta de /api/subscription/status → estado da tela.
 *
 * Aceita também o formato antigo, sem `situacao`: ele fica guardado no
 * sessionStorage por até 1 minuto e continua lá logo depois de uma
 * publicação. Faltando um campo, o padrão é o que NÃO bloqueia a pessoa — quem
 * decide o acesso de verdade é o servidor, a cada gravação.
 */
export function lerStatusAssinatura(dado: unknown): StatusAssinatura {
  const d = (dado && typeof dado === "object" ? dado : {}) as Record<string, unknown>;

  const isVip = Boolean(d.isVip);
  const isTrialing = Boolean(d.isTrialing);
  const isReadOnly = Boolean(d.isReadOnly);
  const hasActiveSubscription = Boolean(d.hasActiveSubscription);

  const situacao: SituacaoAcesso = SITUACOES.includes(d.situacao as SituacaoAcesso)
    ? (d.situacao as SituacaoAcesso)
    : isVip
      ? "vip"
      : hasActiveSubscription
        ? "ativo"
        : isReadOnly
          ? "vencido"
          : "teste";

  const numeroOuNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const textoOuNull = (v: unknown) => (typeof v === "string" && v ? v : null);

  return {
    isVip,
    status: typeof d.status === "string" && d.status ? d.status : "trialing",
    situacao,
    isTrialing,
    trialDaysLeft: numeroOuNull(d.trialDaysLeft) ?? 0,
    trialEndsAt: textoOuNull(d.trialEndsAt),
    isReadOnly,
    hasActiveSubscription,
    diasParaVencer: numeroOuNull(d.diasParaVencer),
    currentPeriodEnd: textoOuNull(d.currentPeriodEnd),
  };
}

/**
 * Um pagamento virou acesso entre `antes` e `depois`?
 *
 * É o que encerra a espera de um pagamento que confirma depois (cartão em
 * análise, PIX pago com o modal fechado). "hasActiveSubscription virou true"
 * cobre teste e somente leitura, mas não quem renova: esse já estava ativo, e
 * o sinal é o fim do acesso andar para a frente.
 */
export function acessoAvancou(antes: StatusAssinatura, depois: StatusAssinatura): boolean {
  if (depois.situacao === "vip" && antes.situacao !== "vip") return true;
  if (depois.hasActiveSubscription && !antes.hasActiveSubscription) return true;

  if (antes.situacao === "ativo" && depois.situacao === "ativo") {
    const fimAntes = paraData(antes.currentPeriodEnd);
    const fimDepois = paraData(depois.currentPeriodEnd);
    // Sem a data de antes não há com o que comparar: esperar é melhor do que
    // anunciar um pagamento que não chegou.
    return Boolean(fimAntes && fimDepois && fimDepois.getTime() > fimAntes.getTime());
  }
  return false;
}

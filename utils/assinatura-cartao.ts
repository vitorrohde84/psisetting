/**
 * Cartão com renovação automática — as regras, sem banco nem rede.
 *
 * A assinatura é uma "preapproval" do Mercado Pago SEM plano: cada pessoa tem o
 * seu valor (o desconto do cupom) e a sua data de início (o fim dos dias que
 * ela já tem). Com plano, o valor viria do plano e mudar o plano mudaria todos.
 *
 * O que o Mercado Pago faz sozinho: cobra todo mês no mesmo dia, tenta de novo
 * um cartão recusado (até 4 vezes em 10 dias) e cancela a assinatura depois de
 * 3 faturas recusadas. O que fica com a gente: os dias de acesso (cada cobrança
 * aprovada passa por processarPagamentoAprovado, como qualquer pagamento), a
 * subida para R$ 34,90 depois dos meses do cupom e o cancelamento.
 */

/** Uma assinatura sem data de fim não existe: com start_date, o Mercado Pago exige end_date. */
export const ANOS_DE_ASSINATURA = 5;

/** Menos que isto até o fim dos dias atuais: cobra já, em vez de agendar. */
const FOLGA_INICIO_MS = 60 * 60 * 1000;

function paraData(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Quando sai a primeira cobrança: no fim dos dias que a pessoa já tem, pagos
 * ou de teste (decisão de 23/09/2026: quem está no teste só é cobrado quando
 * o teste acaba). null = cobrar já.
 *
 * Se o Mercado Pago cobrar antes do previsto, ninguém perde: os 30 dias
 * contam a partir do fim do período atual (processar_pagamento_aprovado).
 */
export function inicioDaCobranca({
  currentPeriodEnd,
  trialEndsAt,
  agora = new Date(),
}: {
  currentPeriodEnd: string | Date | null | undefined;
  trialEndsAt: string | Date | null | undefined;
  agora?: Date;
}): Date | null {
  const futuras = [paraData(currentPeriodEnd), paraData(trialEndsAt)].filter(
    (d): d is Date => d !== null && d.getTime() > agora.getTime()
  );
  if (futuras.length === 0) return null;

  const fim = new Date(Math.max(...futuras.map((d) => d.getTime())));
  return fim.getTime() - agora.getTime() < FOLGA_INICIO_MS ? null : fim;
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export interface DadosDaAssinatura {
  userId: string;
  payerEmail: string;
  cardTokenId: string;
  /** Valor de cada mensalidade agora (com o desconto do cupom, se houver). */
  valor: number;
  /** null = primeira cobrança já. */
  inicio: Date | null;
  backUrl: string;
}

/**
 * Corpo do POST /preapproval. Sem plano, reason, external_reference e back_url
 * são obrigatórios; status "authorized" exige o card_token_id. start_date só
 * vale acompanhado de end_date — sem end_date, o Mercado Pago ignora o
 * start_date e cobra na hora.
 */
export function corpoDaAssinatura(d: DadosDaAssinatura) {
  const autoRecurring: {
    frequency: number;
    frequency_type: string;
    transaction_amount: number;
    currency_id: string;
    start_date?: string;
    end_date?: string;
  } = {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: arredondar(d.valor),
    currency_id: "BRL",
  };

  if (d.inicio) {
    const fim = new Date(d.inicio);
    fim.setUTCFullYear(fim.getUTCFullYear() + ANOS_DE_ASSINATURA);
    autoRecurring.start_date = d.inicio.toISOString();
    autoRecurring.end_date = fim.toISOString();
  }

  return {
    reason: "PsiSetting — Plano Único (renovação mensal)",
    external_reference: d.userId,
    payer_email: d.payerEmail,
    card_token_id: d.cardTokenId,
    back_url: d.backUrl,
    status: "authorized",
    auto_recurring: autoRecurring,
  };
}

/** O pedaço do pagamento do Mercado Pago que diz se ele veio de uma assinatura. */
export interface PagamentoTalvezRecorrente {
  operation_type?: string;
  metadata?: unknown;
  // unknown: o tipo do SDK não traz subscription_id (não é documentado), então
  // é lido com cuidado abaixo.
  point_of_interaction?: unknown;
}

/**
 * Id da assinatura que gerou a cobrança. As cobranças automáticas não trazem
 * a NOSSA metadata (a preapproval não tem esse campo): o Mercado Pago põe
 * metadata.preapproval_id e point_of_interaction.transaction_data.subscription_id.
 */
export function idAssinaturaDoPagamento(p: PagamentoTalvezRecorrente): string | null {
  const meta = p.metadata && typeof p.metadata === "object" ? (p.metadata as Record<string, unknown>) : null;
  const poi = p.point_of_interaction && typeof p.point_of_interaction === "object"
    ? (p.point_of_interaction as { transaction_data?: { subscription_id?: unknown } | null })
    : null;
  const candidatos = [meta?.preapproval_id, poi?.transaction_data?.subscription_id];
  for (const c of candidatos) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

export function ehCobrancaDeAssinatura(p: PagamentoTalvezRecorrente): boolean {
  return p.operation_type === "recurring_payment" || idAssinaturaDoPagamento(p) !== null;
}

/**
 * Cobrança de valor mínimo que o Mercado Pago faz para validar o cartão ao
 * criar a assinatura, e devolve em seguida. Não é mensalidade: dar 30 dias por
 * ela seria acesso de graça.
 *
 * "card_validation" não está na lista oficial de operation_type — só foi visto
 * em pagamentos reais de terceiros, com a descrição "Recurring payment
 * validation". As duas marcas contam; a descrição só em inglês e por inteiro,
 * para um cupom com "VALIDACAO" no nome nunca apagar um pagamento de verdade.
 * Se nenhuma vier, o estorno da validação ainda devolve os dias (webhook).
 */
export function ehValidacaoDeCartao(p: { operation_type?: string; description?: string | null }): boolean {
  if (p.operation_type === "card_validation") return true;
  return typeof p.description === "string" && /\brecurring payment validation\b/i.test(p.description);
}

/** A documentação escreve "canceled"; a API devolve "cancelled". Aceita as duas. */
export function statusCancelado(status: unknown): boolean {
  return status === "cancelled" || status === "canceled";
}

export function mesmoValor(a: unknown, b: unknown): boolean {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.005;
}

/** "4235647728025682" / "**** 5682" / 5682 → "5682"; qualquer outra coisa → null. */
export function quatroUltimos(valor: unknown): string | null {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  return digitos.length >= 4 ? digitos.slice(-4) : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * O e-mail que vai em payer_email. Sem plano, o Mercado Pago compara esse
 * e-mail com o do pagador e recusa a cobrança se não bater — por isso vale o
 * que a pessoa digitou no formulário do cartão, e só na falta dele o da conta.
 */
export function emailDoPagador(doFormulario: unknown, daConta: string | null | undefined): string | null {
  const f = String(doFormulario ?? "").trim().toLowerCase();
  if (EMAIL.test(f)) return f;
  const c = String(daConta ?? "").trim().toLowerCase();
  return EMAIL.test(c) ? c : null;
}

/** O que a tela sabe da renovação automática (vem em /api/subscription/status). */
export interface RenovacaoTela {
  situacao: "criando" | "ativa" | "cancelada";
  /** Valor da próxima cobrança, como está no Mercado Pago. */
  valor: number | null;
  proximaCobranca: string | null;
  /** Primeira cobrança agendada (quem assinou com dias restantes). */
  primeiraCobranca: string | null;
  cartaoFinal: string | null;
  cartaoBandeira: string | null;
  /** A última cobrança do mês foi recusada e ainda não passou. */
  cobrancaRecusada: boolean;
  canceladaEm: string | null;
  canceladaPor: string | null;
  /** Quando foi ligada: decide se a tolerância de 10 dias vale (utils/acesso-assinatura.ts). */
  criadaEm?: string | null;
}

/** Cancelada há mais que isto some da tela (a pessoa já voltou ao mês a mês). */
const MOSTRA_CANCELADA_DIAS = 45;

export function renovacaoParaTela(
  linha: {
    situacao: string;
    valor_atual: number | string | null;
    proxima_cobranca: string | null;
    primeira_cobranca: string | null;
    cartao_final: string | null;
    cartao_bandeira: string | null;
    ultima_recusa_em: string | null;
    cancelada_em: string | null;
    cancelada_por: string | null;
    criada_em?: string | null;
  } | null,
  agora = new Date()
): RenovacaoTela | null {
  if (!linha) return null;
  if (linha.situacao !== "criando" && linha.situacao !== "ativa" && linha.situacao !== "cancelada") return null;

  if (linha.situacao === "cancelada") {
    const em = paraData(linha.cancelada_em);
    if (!em || agora.getTime() - em.getTime() > MOSTRA_CANCELADA_DIAS * 86_400_000) return null;
  }

  const valor = Number(linha.valor_atual);
  return {
    situacao: linha.situacao,
    valor: linha.valor_atual !== null && Number.isFinite(valor) ? valor : null,
    proximaCobranca: linha.situacao === "ativa" ? linha.proxima_cobranca : null,
    primeiraCobranca: linha.primeira_cobranca,
    cartaoFinal: linha.cartao_final,
    cartaoBandeira: linha.cartao_bandeira,
    cobrancaRecusada: linha.situacao === "ativa" && Boolean(linha.ultima_recusa_em),
    canceladaEm: linha.cancelada_em,
    canceladaPor: linha.cancelada_por,
    criadaEm: linha.criada_em ?? null,
  };
}

/**
 * Erro do Mercado Pago ao criar a assinatura → texto para a pessoa. A mensagem
 * crua pode ter detalhe interno e nunca vai para a tela.
 */
/**
 * O device ID que o navegador mandou, se tiver cara de um. Vem do cliente, vai
 * para um cabeçalho HTTP: nada de espaço, quebra de linha ou tamanho absurdo.
 */
export function deviceIdValido(valor: unknown): string | null {
  const v = typeof valor === "string" ? valor.trim() : "";
  return /^[A-Za-z0-9._:-]{8,200}$/.test(v) ? v : null;
}

/**
 * Resumo do erro do Mercado Pago para a coluna `erro` (só o servidor e o admin
 * leem): status, mensagem e códigos das causas. É o que diz POR QUE uma
 * criação falhou — antes ficava só "status 400", e o motivo real
 * (CC_VAL_433) só aparecia no log da Vercel.
 */
export function resumoErroMercadoPago(erro: unknown): string {
  const e = erro as { status?: number; message?: string; causes?: unknown } | null;
  const causas = Array.isArray(e?.causes)
    ? (e.causes as Array<{ code?: unknown; description?: unknown }>)
        .map((c) => [c?.code, c?.description].filter(Boolean).join(" "))
        .filter(Boolean)
        .join("; ")
    : "";
  return [`status ${e?.status ?? "?"}`, e?.message, causas].filter(Boolean).join(" — ").slice(0, 500);
}

export function mensagemErroAssinatura(erro: unknown): string {
  // O SDK 3.4 guarda o detalhe em `causes` (a lista "cause" da resposta).
  const e = erro as { message?: string; causes?: unknown; cause?: unknown; status?: number } | null;
  const texto = [e?.message, JSON.stringify(e?.causes ?? ""), JSON.stringify(e?.cause ?? "")].join(" ").toLowerCase();

  // Só o token do CARTÃO: "token" sozinho pegaria também erro da nossa chave
  // de acesso, e a pessoa ficaria corrigindo um cartão que está certo.
  if (/card_token|card token|cardtoken/.test(texto)) {
    return "Não conseguimos ler o cartão. Confira os dados e tente de novo.";
  }
  if (/payer_email|email/.test(texto)) {
    return "O Mercado Pago não aceitou o e-mail informado para a cobrança automática. Confira o e-mail no formulário ou escolha Mês a mês.";
  }
  if (/different countries|países/.test(texto)) {
    return "Este cartão não pode ser usado para cobrança automática no Brasil. Escolha Mês a mês ou pague por PIX.";
  }
  // CC_VAL_433: a cobrança de verificação do cartão foi recusada, quase sempre
  // pelo antifraude (tentativas seguidas, e-mail diferente do da conta
  // Mercado Pago do cartão) ou pelo banco. Repetir na hora piora.
  if (/cc_val_|validation has failed|high_risk/.test(texto)) {
    return "O Mercado Pago não conseguiu validar este cartão para a cobrança automática. Use no formulário o mesmo e-mail da sua conta Mercado Pago, confira no app do banco se há uma compra recusada para liberar e tente de novo daqui a alguns minutos — ou escolha Mês a mês.";
  }
  return "O Mercado Pago não aceitou este cartão para a cobrança automática. Tente outro cartão, escolha Mês a mês ou pague por PIX.";
}

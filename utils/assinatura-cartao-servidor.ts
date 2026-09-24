import type { SupabaseClient } from "@supabase/supabase-js";
import {
  atualizarAssinaturaMP,
  criarAssinaturaMP,
  invoiceClient,
  paymentClient,
  preApprovalClient,
} from "./mercadopago";
import {
  corpoDaAssinatura,
  inicioDaCobranca,
  mensagemErroAssinatura,
  mesmoValor,
  resumoErroMercadoPago,
  statusCancelado,
} from "./assinatura-cartao";
import { calcularPrecoAssinatura, type DescontoAplicado } from "./preco-assinatura";
import { MENSAGEM_CUPOM_INVALIDO } from "./coupons";
import { processarPagamentoAprovado, type OrigemPagamento } from "./pagamento-aprovado";
import { cancelarOutrosPixPendentes } from "./pix-cancelamento";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Renovação automática no cartão — o que conversa com o Mercado Pago e com o
 * banco. As regras puras estão em utils/assinatura-cartao.ts.
 *
 * Três caminhos ficam sabendo de uma assinatura e das cobranças dela: a
 * criação (rota /api/subscription/automatica), o webhook e a conferência
 * diária (/api/cron/assinaturas). Todos passam por aqui, e tudo aqui é seguro
 * de repetir: as cobranças vão para processarPagamentoAprovado (idempotente por
 * payment_id) e os estados do Mercado Pago só são copiados.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, any, any>;

export type SituacaoAssinatura = "criando" | "ativa" | "cancelada" | "falhou";
export type CanceladaPor = "usuario" | "admin" | "mercadopago" | "sistema";

export interface LinhaAssinatura {
  id: string;
  user_id: string;
  mp_preapproval_id: string | null;
  situacao: SituacaoAssinatura;
  mp_status: string | null;
  valor_atual: number | string | null;
  primeira_cobranca: string | null;
  proxima_cobranca: string | null;
  payer_email: string | null;
  cartao_final: string | null;
  cartao_bandeira: string | null;
  resgate_reservado_id: string | null;
  ultima_recusa_em: string | null;
  cancelada_em: string | null;
  cancelada_por: CanceladaPor | null;
  erro: string | null;
  criada_em: string;
  atualizada_em: string;
}

const COLUNAS =
  "id, user_id, mp_preapproval_id, situacao, mp_status, valor_atual, primeira_cobranca, proxima_cobranca, payer_email, cartao_final, cartao_bandeira, resgate_reservado_id, ultima_recusa_em, cancelada_em, cancelada_por, erro, criada_em, atualizada_em";

/** Criação sem resposta do Mercado Pago há mais que isto: procurar lá e decidir. */
const ESPERA_CRIACAO_MS = 2 * 60 * 1000;
/** Sem achar a assinatura no Mercado Pago depois disto, a criação falhou. */
const DESISTE_CRIACAO_MS = 60 * 60 * 1000;

function agoraIso(): string {
  return new Date().toISOString();
}

function dataOuNull(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const d = new Date(valor as string | number);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function numeroOuNull(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// ── Leitura ─────────────────────────────────────────────────────────────────

/** A assinatura viva (criando ou ativa) da pessoa, se houver. */
export async function assinaturaViva(admin: AdminClient, userId: string): Promise<LinhaAssinatura | null> {
  const { data, error } = await admin
    .from("assinaturas_cartao")
    .select(COLUNAS)
    .eq("user_id", userId)
    .in("situacao", ["criando", "ativa"])
    .maybeSingle();
  if (error) throw error;
  return (data as LinhaAssinatura | null) ?? null;
}

/** A mais recente, viva ou não — para a tela mostrar "cancelada em DD/MM". */
export async function assinaturaMaisRecente(admin: AdminClient, userId: string): Promise<LinhaAssinatura | null> {
  const { data, error } = await admin
    .from("assinaturas_cartao")
    .select(COLUNAS)
    .eq("user_id", userId)
    .neq("situacao", "falhou")
    .order("criada_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as LinhaAssinatura | null) ?? null;
}

export async function assinaturaPorPreapproval(
  admin: AdminClient,
  preapprovalId: string
): Promise<LinhaAssinatura | null> {
  const { data, error } = await admin
    .from("assinaturas_cartao")
    .select(COLUNAS)
    .eq("mp_preapproval_id", preapprovalId)
    .maybeSingle();
  if (error) throw error;
  return (data as LinhaAssinatura | null) ?? null;
}

async function atualizarLinha(
  admin: AdminClient,
  id: string,
  campos: Partial<LinhaAssinatura>
): Promise<void> {
  const { error } = await admin
    .from("assinaturas_cartao")
    .update({ ...campos, atualizada_em: agoraIso() })
    .eq("id", id);
  if (error) throw error;
}

/** Devolve o cupom reservado ao assinar, se nenhuma mensalidade chegou a usá-lo. */
async function liberarReserva(admin: AdminClient, linha: Pick<LinhaAssinatura, "user_id" | "resgate_reservado_id">) {
  if (!linha.resgate_reservado_id) return;
  const { error } = await admin.rpc("liberar_reserva_cupom", {
    p_user_id: linha.user_id,
    p_resgate_id: linha.resgate_reservado_id,
  });
  if (error) console.error(`[assinatura] não foi possível liberar a reserva de cupom de ${linha.user_id}:`, error.message);
}

async function marcarFalha(admin: AdminClient, linha: LinhaAssinatura, motivo: string): Promise<void> {
  await atualizarLinha(admin, linha.id, { situacao: "falhou", erro: motivo.slice(0, 500) });
  await liberarReserva(admin, linha);
}

// ── O que o Mercado Pago diz sobre a assinatura ─────────────────────────────

interface AssinaturaMP {
  id?: string;
  status?: string;
  external_reference?: string | number | null;
  next_payment_date?: string | number | null;
  auto_recurring?: { transaction_amount?: number | string | null } | null;
  date_created?: string | number | null;
}

function camposDoMP(sub: AssinaturaMP): Partial<LinhaAssinatura> {
  return {
    mp_status: sub.status ?? null,
    proxima_cobranca: dataOuNull(sub.next_payment_date),
    valor_atual: numeroOuNull(sub.auto_recurring?.transaction_amount),
  };
}

// ── Pagamentos de assinatura (verificação do cartão e cobranças) ────────────

/** O pedaço do pagamento (busca) que diz o que aconteceu numa verificação ou cobrança. */
export interface PagamentoDeAssinatura {
  id: string;
  data: string | null;
  status: string | null;
  statusDetail: string | null;
  valor: number | null;
  operacao: string | null;
  canal: string | null;
  email: string | null;
  referencia: string | null;
}

function textoOuNull(v: unknown): string | null {
  return typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null;
}

/**
 * Pagamentos ligados a assinaturas num intervalo: as cobranças de verificação
 * do cartão (as que voltam CC_VAL_433 quando recusadas) e as mensalidades. O
 * motivo real de uma verificação recusada (status_detail, ex.:
 * cc_rejected_high_risk) só existe aqui — a resposta da criação não traz.
 */
export async function pagamentosDeAssinatura({ desde, ate }: { desde: Date; ate: Date }): Promise<PagamentoDeAssinatura[]> {
  const encontrados: PagamentoDeAssinatura[] = [];
  for (let pagina = 0; pagina < 3; pagina++) {
    const busca = await paymentClient.search({
      options: {
        sort: "date_created",
        criteria: "desc",
        range: "date_created",
        begin_date: desde.toISOString(),
        end_date: ate.toISOString(),
        limit: 50,
        offset: pagina * 50,
      },
    });
    const resultados = ((busca as { results?: unknown[] })?.results ?? []) as Array<Record<string, unknown>>;
    for (const p of resultados) {
      const poi = p.point_of_interaction as { type?: unknown } | null | undefined;
      const operacao = textoOuNull(p.operation_type);
      const canal = textoOuNull(poi?.type);
      if (operacao !== "card_validation" && operacao !== "recurring_payment" && canal !== "SUBSCRIPTIONS") continue;
      const payer = p.payer as { email?: unknown } | null | undefined;
      encontrados.push({
        id: String(p.id ?? ""),
        data: textoOuNull(p.date_created),
        status: textoOuNull(p.status),
        statusDetail: textoOuNull(p.status_detail),
        valor: typeof p.transaction_amount === "number" ? p.transaction_amount : null,
        operacao,
        canal,
        email: textoOuNull(payer?.email),
        referencia: textoOuNull(p.external_reference),
      });
    }
    if (resultados.length < 50) break;
  }
  return encontrados;
}

/**
 * O motivo da verificação recusada logo depois de uma criação que voltou
 * CC_VAL_*: a verificação mais recente com o e-mail do pagador (ou, sem
 * e-mail na busca, a mais recente do intervalo — por isso "provável").
 * Diagnóstico para o admin; nunca decide nada sozinho. No máximo ~5 s.
 */
async function motivoDaVerificacao(payerEmail: string, desde: Date): Promise<string | null> {
  const busca = pagamentosDeAssinatura({
    desde: new Date(desde.getTime() - 2 * 60 * 1000),
    ate: new Date(Date.now() + 60 * 1000),
  }).catch(() => [] as PagamentoDeAssinatura[]);
  const lista = await Promise.race([
    busca,
    new Promise<PagamentoDeAssinatura[]>((r) => setTimeout(() => r([]), 5000)),
  ]);
  const doPagador = lista.find((p) => p.email?.toLowerCase() === payerEmail.toLowerCase());
  const alvo = doPagador ?? lista[0];
  if (!alvo) return null;
  return `${doPagador ? "verificação" : "verificação provável"} ${alvo.id}: ${alvo.status ?? "?"}/${alvo.statusDetail ?? "?"}${
    alvo.valor !== null ? ` (R$ ${alvo.valor})` : ""
  }`;
}

// ── Criação ─────────────────────────────────────────────────────────────────

export type ResultadoCriacao =
  | { ok: true; primeiraCobranca: string | null; proximaCobranca: string | null; valor: number }
  | { ok: false; status: 400 | 409; erro: string; erroDeCupom?: boolean; jaTem?: boolean }
  | { ok: false; status: 202; incerto: true; erro: string };

/**
 * Cria a assinatura. A ordem importa:
 *  1. grava a linha "criando" — o índice único do banco barra a segunda
 *     assinatura (dois cliques, duas abas) ANTES de o Mercado Pago ver algo;
 *  2. reserva o cupom digitado agora (a promessa da tela vale desde já);
 *  3. cria no Mercado Pago, sem novas tentativas automáticas;
 *  4. falha clara → devolve a reserva e marca "falhou"; falha ambígua (rede,
 *     tempo esgotado, 5xx) → deixa "criando" e a conferência procura no
 *     Mercado Pago antes de qualquer nova tentativa. Nunca duas assinaturas.
 */
export async function criarAssinaturaCartao({
  admin,
  userId,
  payerEmail,
  cardTokenId,
  valor,
  desconto,
  perfil,
  backUrl,
  cartaoFinal,
  cartaoBandeira,
  deviceId = null,
  agora = new Date(),
}: {
  admin: AdminClient;
  userId: string;
  payerEmail: string;
  cardTokenId: string;
  valor: number;
  desconto: DescontoAplicado | null;
  perfil: { current_period_end: string | null; trial_ends_at: string | null };
  backUrl: string;
  cartaoFinal: string | null;
  cartaoBandeira: string | null;
  /** Device ID do navegador (security.js): o antifraude usa na verificação do cartão. */
  deviceId?: string | null;
  agora?: Date;
}): Promise<ResultadoCriacao> {
  // 1. A trava.
  const { data: nova, error: erroInsert } = await admin
    .from("assinaturas_cartao")
    .insert({
      user_id: userId,
      situacao: "criando",
      payer_email: payerEmail,
      cartao_final: cartaoFinal,
      cartao_bandeira: cartaoBandeira,
    })
    .select(COLUNAS)
    .single();

  if (erroInsert) {
    if (erroInsert.code === "23505") {
      return { ok: false, status: 409, jaTem: true, erro: "Você já tem a renovação automática ligada." };
    }
    throw erroInsert;
  }
  let linha = nova as LinhaAssinatura;

  // Um QR de PIX gerado antes e ainda aberto deixa de valer: pagar os dois
  // seria cobrar o mesmo mês duas vezes. Falhar aqui não impede de assinar —
  // o PIX vence sozinho em minutos.
  try {
    await cancelarOutrosPixPendentes({ userId, exceto: "" });
  } catch (err) {
    console.error(`[assinatura] PIX pendentes de ${userId} não cancelados ao ligar a renovação:`, err);
  }

  // 2. O cupom digitado agora vira resgate já. O que a pessoa já usa não
  //    precisa de reserva: o resgate existe.
  if (desconto?.origem === "cupom_novo") {
    const { data: reserva, error: erroReserva } = await admin.rpc("reservar_cupom_assinatura", {
      p_user_id: userId,
      p_cupom_id: desconto.couponId,
      p_tipo: desconto.tipo,
      p_valor: desconto.valor,
      p_duracao: desconto.duracaoMeses,
      p_para_sempre: desconto.paraSempre,
    });
    if (erroReserva) {
      await marcarFalha(admin, linha, `reserva do cupom: ${erroReserva.message}`);
      throw erroReserva;
    }
    const r = (reserva ?? {}) as { ok?: boolean; reservado?: boolean; resgate_id?: string; motivo?: string };
    if (!r.ok) {
      await marcarFalha(admin, linha, `cupom recusado: ${r.motivo ?? "?"}`);
      return { ok: false, status: 400, erroDeCupom: true, erro: MENSAGEM_CUPOM_INVALIDO };
    }
    if (r.reservado && r.resgate_id) {
      await atualizarLinha(admin, linha.id, { resgate_reservado_id: r.resgate_id });
      linha = { ...linha, resgate_reservado_id: r.resgate_id };
    }
  }

  // 3. O Mercado Pago.
  const inicio = inicioDaCobranca({
    currentPeriodEnd: perfil.current_period_end,
    trialEndsAt: perfil.trial_ends_at,
    agora,
  });

  let sub: AssinaturaMP;
  const tentativaEm = new Date();
  try {
    sub = (await criarAssinaturaMP(
      corpoDaAssinatura({ userId, payerEmail, cardTokenId, valor, inicio, backUrl }),
      { deviceId }
    )) as AssinaturaMP;
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    console.error(`[assinatura] criação no Mercado Pago falhou para ${userId} (status ${status ?? "?"}):`, err);

    // Erro de rede e tempo esgotado chegam do SDK 3.4 com status 0
    // (MPConnectionError), não undefined — e são os casos MAIS ambíguos.
    if (!status || status >= 500 || status === 429) {
      await atualizarLinha(admin, linha.id, { erro: `sem resposta clara do Mercado Pago (status ${status ?? "rede"})` });
      return {
        ok: false,
        status: 202,
        incerto: true,
        erro: "Não conseguimos confirmar a renovação automática com o Mercado Pago agora. Não tente de novo: em alguns minutos ela aparece em Configurações, se tiver sido criada.",
      };
    }

    // CC_VAL_*: a verificação do cartão foi recusada, e o porquê está no
    // pagamento de verificação, não nesta resposta. Guarda os dois.
    let motivo = resumoErroMercadoPago(err);
    if (/cc_val_/i.test(motivo)) {
      const verificacao = await motivoDaVerificacao(payerEmail, tentativaEm);
      if (verificacao) motivo = `${motivo} — ${verificacao}`;
    }
    await marcarFalha(admin, linha, `Mercado Pago recusou: ${motivo}`);
    return { ok: false, status: 400, erro: mensagemErroAssinatura(err) };
  }

  if (!sub?.id) {
    await atualizarLinha(admin, linha.id, { erro: "resposta do Mercado Pago sem id" });
    return {
      ok: false,
      status: 202,
      incerto: true,
      erro: "Não conseguimos confirmar a renovação automática agora. Em alguns minutos ela aparece em Configurações, se tiver sido criada.",
    };
  }

  // Pedimos "authorized" (cartão válido, cobrando). Qualquer outro estado não
  // é uma assinatura que vai cobrar: desfaz lá e avisa aqui, em vez de mostrar
  // "renovação ligada" para algo que nunca vai cobrar.
  if (sub.status !== "authorized") {
    console.error(`[assinatura] ${sub.id} de ${userId} voltou com status ${sub.status}; cancelando.`);
    try {
      await cancelarNoMercadoPago(String(sub.id));
    } catch (err) {
      console.error(`[assinatura] não foi possível cancelar ${sub.id} (status ${sub.status}):`, err);
    }
    await marcarFalha(admin, linha, `Mercado Pago devolveu status ${sub.status}`);
    return {
      ok: false,
      status: 400,
      erro: "O Mercado Pago não autorizou a cobrança automática neste cartão. Tente outro cartão, escolha Mês a mês ou pague por PIX.",
    };
  }

  // 4. Deu certo. Se gravar falhar, a assinatura existe mesmo assim: o webhook
  //    e a conferência diária encontram a linha "criando" e terminam o trabalho.
  const campos = camposDoMP(sub);
  try {
    await atualizarLinha(admin, linha.id, {
      ...campos,
      situacao: "ativa",
      mp_preapproval_id: String(sub.id),
      primeira_cobranca: inicio ? inicio.toISOString() : null,
      erro: null,
    });
  } catch (err) {
    console.error(`[assinatura] ${sub.id} criada no Mercado Pago mas não gravada (${userId}); a conferência corrige:`, err);
  }

  return {
    ok: true,
    primeiraCobranca: inicio ? inicio.toISOString() : null,
    proximaCobranca: campos.proxima_cobranca ?? null,
    valor: numeroOuNull(campos.valor_atual) ?? valor,
  };
}

/**
 * Criação que ficou sem resposta clara: procura no Mercado Pago uma
 * assinatura desta pessoa criada depois da linha. Achou → ativa. Não achou
 * depois de uma hora → falhou (e devolve o cupom).
 */
export async function resolverCriacaoPendente(
  admin: AdminClient,
  linha: LinhaAssinatura,
  agora = new Date()
): Promise<LinhaAssinatura["situacao"]> {
  if (linha.situacao !== "criando") return linha.situacao;
  const idade = agora.getTime() - new Date(linha.criada_em).getTime();
  if (idade < ESPERA_CRIACAO_MS) return "criando";

  const encontradas = await buscarAssinaturasDaPessoa(linha.user_id, linha.payer_email);
  const criadaEm = new Date(linha.criada_em).getTime() - 60_000;
  const candidata = encontradas
    .filter((s) => !statusCancelado(s.status))
    .filter((s) => {
      const d = s.date_created ? new Date(s.date_created).getTime() : NaN;
      return !Number.isFinite(d) || d >= criadaEm;
    })
    .sort((a, b) => String(b.date_created ?? "").localeCompare(String(a.date_created ?? "")))[0];

  if (candidata?.id) {
    await atualizarLinha(admin, linha.id, {
      ...camposDoMP(candidata),
      situacao: "ativa",
      mp_preapproval_id: String(candidata.id),
      erro: null,
    });
    console.warn(`[assinatura] criação pendente de ${linha.user_id} encontrada no Mercado Pago: ${candidata.id}.`);
    return "ativa";
  }

  if (idade >= DESISTE_CRIACAO_MS) {
    await marcarFalha(admin, linha, "não encontrada no Mercado Pago depois de 1 hora");
    return "falhou";
  }
  return "criando";
}

/**
 * Assinaturas desta pessoa no Mercado Pago. O /preapproval/search não filtra
 * por external_reference (não documentado, e já foi visto ignorando o filtro):
 * busca pelo e-mail do pagador e confere a referência aqui.
 */
async function buscarAssinaturasDaPessoa(userId: string, payerEmail: string | null): Promise<AssinaturaMP[]> {
  if (!payerEmail) return [];
  const busca = await preApprovalClient.search({ options: { payer_email: payerEmail, limit: 50 } });
  const resultados = ((busca as { results?: AssinaturaMP[] })?.results ?? []) as AssinaturaMP[];
  return resultados.filter((s) => String(s.external_reference ?? "") === userId);
}

// ── Adoção: assinatura que o Mercado Pago avisou e a tabela não conhece ─────

/**
 * O Mercado Pago avisou de uma assinatura (webhook) que não está na tabela
 * pelo id. A referência é o id da conta, gravado por nós na criação:
 *  - a pessoa tem uma linha "criando" → é a criação que ficou sem resposta
 *    clara: vincula direto a este id, sem depender da busca por e-mail;
 *  - a pessoa já tem outra "ativa" → esta é uma duplicata criada por nós:
 *    cancela lá (nunca duas cobrando o mesmo cartão);
 *  - a pessoa não tem nenhuma viva, mas a última criação "falhou" pouco antes
 *    desta assinatura nascer → desistimos cedo demais: recupera a linha, para a
 *    assinatura não ficar cobrando sem aparecer em Configurações.
 * Devolve a linha que passou a representar a assinatura, ou null.
 */
export async function adotarAssinatura(admin: AdminClient, sub: AssinaturaMP): Promise<LinhaAssinatura | null> {
  const referencia = String(sub.external_reference ?? "");
  if (!UUID.test(referencia) || !sub.id) return null;
  const id = String(sub.id);
  const campos = camposDoMP(sub);

  const viva = await assinaturaViva(admin, referencia);
  if (viva?.situacao === "criando") {
    if (statusCancelado(sub.status)) return null;
    await atualizarLinha(admin, viva.id, { ...campos, situacao: "ativa", mp_preapproval_id: id, erro: null });
    console.warn(`[assinatura] criação pendente de ${referencia} vinculada pelo aviso do Mercado Pago: ${id}.`);
    return { ...viva, ...campos, situacao: "ativa", mp_preapproval_id: id } as LinhaAssinatura;
  }
  if (viva?.situacao === "ativa") {
    if (viva.mp_preapproval_id !== id && !statusCancelado(sub.status)) {
      console.error(`[assinatura] ${referencia} já tem ${viva.mp_preapproval_id}; ${id} é duplicata — cancelando.`);
      await cancelarNoMercadoPago(id);
    }
    return null;
  }

  if (statusCancelado(sub.status)) return null;
  const { data, error } = await admin
    .from("assinaturas_cartao")
    .select(COLUNAS)
    .eq("user_id", referencia)
    .eq("situacao", "falhou")
    .order("criada_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const falhou = data as LinhaAssinatura | null;
  const nasceu = sub.date_created ? new Date(sub.date_created).getTime() : NaN;
  if (falhou && Number.isFinite(nasceu)) {
    const linhaEm = new Date(falhou.criada_em).getTime();
    if (nasceu >= linhaEm - 60_000 && nasceu - linhaEm < 24 * 60 * 60 * 1000) {
      await atualizarLinha(admin, falhou.id, {
        ...campos,
        situacao: "ativa",
        mp_preapproval_id: id,
        erro: "recuperada: a assinatura existia no Mercado Pago",
      });
      console.error(`[assinatura] criação de ${referencia} dada como falha, mas ${id} existe no Mercado Pago — recuperada.`);
      return { ...falhou, ...campos, situacao: "ativa", mp_preapproval_id: id } as LinhaAssinatura;
    }
  }
  return null;
}

// ── Sincronização (estado, próxima cobrança, valor) ─────────────────────────

/**
 * Copia o estado do Mercado Pago e acerta o valor da próxima cobrança.
 *
 * O valor certo é o preço de agora da pessoa (utils/preco-assinatura.ts): com
 * o cupom em uso e mensalidades com desconto restando, o valor com desconto;
 * esgotadas, ou desconto encerrado pelo admin, R$ 34,90. Rodar depois de cada
 * cobrança aprovada faz a subida acontecer um mês antes da cobrança seguinte.
 * A leitura dos descontos é ESTRITA: se ela falhar, nada muda no Mercado Pago
 * (sem ela, "sem desconto" subiria o valor no meio dos meses do cupom).
 *
 * Estados: "authorized" é a assinatura cobrando; cancelada, "paused" e
 * "finished" deixam de ser renovação viva (a pausa não é nossa — cancela lá
 * para não voltar a cobrar sem aviso); "pending" é deixado como está.
 */
export async function sincronizarAssinatura(admin: AdminClient, linha: LinhaAssinatura): Promise<LinhaAssinatura> {
  if (!linha.mp_preapproval_id) return linha;

  const sub = (await preApprovalClient.get({ id: linha.mp_preapproval_id })) as AssinaturaMP;
  const campos = camposDoMP(sub);
  let atualizada: LinhaAssinatura = { ...linha, ...campos } as LinhaAssinatura;
  const encerrada = statusCancelado(sub.status) || sub.status === "paused" || sub.status === "finished";

  if (encerrada) {
    if (linha.situacao !== "cancelada") {
      if (sub.status === "paused") {
        console.error(`[assinatura] ${linha.mp_preapproval_id} (${linha.user_id}) apareceu pausada; cancelando.`);
        await cancelarNoMercadoPago(linha.mp_preapproval_id);
      }
      atualizada = {
        ...atualizada,
        situacao: "cancelada",
        cancelada_em: agoraIso(),
        // Ninguém aqui pediu: foi o Mercado Pago (3 faturas recusadas, fim da
        // vigência) ou a pessoa pelo app do Mercado Pago.
        cancelada_por: "mercadopago",
      };
      await liberarReservaSeSeguro(admin, linha);
    }
  } else if (sub.status === "authorized" && linha.situacao === "ativa") {
    const preco = await calcularPrecoAssinatura({ adminClient: admin, userId: linha.user_id, estrito: true });
    if (!mesmoValor(preco.valor, campos.valor_atual)) {
      await atualizarAssinaturaMP(linha.mp_preapproval_id, {
        auto_recurring: { transaction_amount: preco.valor, currency_id: "BRL" },
      });
      console.warn(
        `[assinatura] ${linha.mp_preapproval_id} (${linha.user_id}): valor ${campos.valor_atual} → ${preco.valor}.`
      );
      atualizada = { ...atualizada, valor_atual: preco.valor };
    }
  } else if (sub.status !== "authorized" && sub.status !== "pending") {
    console.error(`[assinatura] ${linha.mp_preapproval_id} (${linha.user_id}) com status inesperado: ${sub.status}.`);
  }

  await atualizarLinha(admin, linha.id, {
    mp_status: atualizada.mp_status,
    proxima_cobranca: atualizada.proxima_cobranca,
    valor_atual: atualizada.valor_atual,
    situacao: atualizada.situacao,
    cancelada_em: atualizada.cancelada_em,
    cancelada_por: atualizada.cancelada_por,
  });
  return atualizada;
}

export async function marcarRecusa(admin: AdminClient, linha: LinhaAssinatura): Promise<void> {
  if (linha.situacao !== "ativa") return;
  await atualizarLinha(admin, linha.id, { ultima_recusa_em: agoraIso() });
}

// ── Cobranças ───────────────────────────────────────────────────────────────

interface FaturaMP {
  id?: string | number;
  preapproval_id?: string;
  status?: string;
  payment?: { id?: string | number; status?: string } | null;
  debit_date?: string | null;
}

/** Faturas com data de débito nos últimos N dias — as mais antigas já foram creditadas. */
const JANELA_FATURAS_DIAS = 90;
const PAGINA_FATURAS = 50;
const MAX_PAGINAS_FATURAS = 6;

/**
 * Todas as faturas recentes da assinatura. A busca do Mercado Pago pagina e
 * não documenta a ordem: lê as páginas e filtra pela data de débito, em vez
 * de confiar que as 12 primeiras são as mais novas (depois de um ano, não são).
 */
async function faturasRecentes(preapprovalId: string, agora = new Date()): Promise<FaturaMP[]> {
  const todas: FaturaMP[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS_FATURAS; pagina++) {
    const busca = (await invoiceClient.search({
      options: { preapproval_id: preapprovalId, limit: PAGINA_FATURAS, offset: pagina * PAGINA_FATURAS },
    })) as { results?: FaturaMP[]; paging?: { total?: number } };
    const resultados = busca?.results ?? [];
    todas.push(...resultados);
    const total = Number(busca?.paging?.total);
    if (resultados.length < PAGINA_FATURAS || (Number.isFinite(total) && todas.length >= total)) break;
  }
  const corte = agora.getTime() - JANELA_FATURAS_DIAS * 24 * 60 * 60 * 1000;
  return todas
    .filter((f) => {
      const d = f.debit_date ? new Date(f.debit_date).getTime() : NaN;
      return !Number.isFinite(d) || d >= corte;
    })
    .sort((a, b) => String(b.debit_date ?? "").localeCompare(String(a.debit_date ?? "")));
}

/**
 * Uma fatura (cobrança mensal) da assinatura: aprovada vira dias; recusada
 * marca a recusa. É o caminho DOCUMENTADO para ligar assinatura e pagamento —
 * não depende de o pagamento trazer o id da assinatura nem a nossa referência.
 *
 * contaRecusa: só a fatura mais recente diz se o cartão está sendo recusado
 * AGORA. Uma recusa de meses atrás, já superada por cobranças aprovadas, não
 * pode reacender o aviso a cada conferência.
 */
export async function processarFatura(
  admin: AdminClient,
  linha: LinhaAssinatura,
  fatura: FaturaMP,
  origem: OrigemPagamento,
  contaRecusa = true
): Promise<"aprovada" | "recusada" | "pendente"> {
  const pagamentoId = fatura.payment?.id;
  if (pagamentoId === undefined || pagamentoId === null) {
    if (fatura.status === "recycling") {
      if (contaRecusa) await marcarRecusa(admin, linha);
      return "recusada";
    }
    return "pendente";
  }

  const pagamento = await paymentClient.get({ id: String(pagamentoId) });
  if (pagamento.status === "approved") {
    await processarPagamentoAprovado({
      adminClient: admin,
      userId: linha.user_id,
      payment: pagamento,
      origem,
      recorrente: true,
    });
    return "aprovada";
  }
  if (pagamento.status === "rejected" || fatura.status === "recycling") {
    if (contaRecusa) await marcarRecusa(admin, linha);
    return "recusada";
  }
  return "pendente";
}

/** Processa as faturas recentes; a mais recente já vencida é a que diz se há recusa agora. */
async function processarFaturas(admin: AdminClient, linha: LinhaAssinatura, contaRecusa: boolean): Promise<FaturaMP[]> {
  if (!linha.mp_preapproval_id) return [];
  const faturas = await faturasRecentes(linha.mp_preapproval_id);
  const agora = Date.now();
  const vigente = faturas.find((f) => {
    const d = f.debit_date ? new Date(f.debit_date).getTime() : NaN;
    return f.status !== "scheduled" && (!Number.isFinite(d) || d <= agora);
  });
  for (const f of faturas) {
    try {
      await processarFatura(admin, linha, f, "cron", contaRecusa && f === vigente);
    } catch (err) {
      console.error(`[assinatura] fatura ${f.id} de ${linha.mp_preapproval_id} não processada:`, err);
    }
  }
  return faturas;
}

/** Cancelada há menos que isto: a conferência ainda olha as faturas (cobrança que chegou atrasada). */
const CONFERE_CANCELADA_DIAS = 35;

/**
 * Conferência completa de uma assinatura (a rotina diária). Pega o que o
 * webhook não trouxe: cobranças aprovadas sem dias, cancelamento feito pelo
 * Mercado Pago, valor que não subiu — e assinaturas a mais da mesma pessoa.
 * Canceladas há pouco só têm as faturas conferidas: uma cobrança feita antes do
 * cancelamento ainda pode ser aprovada depois.
 */
export async function conferirAssinatura(admin: AdminClient, linha: LinhaAssinatura): Promise<void> {
  if (linha.situacao === "criando") {
    await resolverCriacaoPendente(admin, linha);
    return;
  }
  if (!linha.mp_preapproval_id) return;

  if (linha.situacao === "cancelada") {
    const em = linha.cancelada_em ? new Date(linha.cancelada_em).getTime() : 0;
    if (Date.now() - em <= CONFERE_CANCELADA_DIAS * 24 * 60 * 60 * 1000) {
      await processarFaturas(admin, linha, false);
    }
    return;
  }
  if (linha.situacao !== "ativa") return;

  // Faturas primeiro: a subida de valor depende das mensalidades já contadas.
  await processarFaturas(admin, linha, true);

  const atualizada = await sincronizarAssinatura(admin, linha);

  // Nunca duas: se o Mercado Pago tiver outra assinatura viva desta pessoa
  // (criação repetida que ninguém viu), cancela a que não é a nossa.
  if (atualizada.situacao === "ativa") {
    const outras = (await buscarAssinaturasDaPessoa(linha.user_id, linha.payer_email)).filter(
      (s) => s.id && String(s.id) !== linha.mp_preapproval_id && !statusCancelado(s.status)
    );
    for (const s of outras) {
      console.error(`[assinatura] ${linha.user_id} tinha OUTRA assinatura viva no Mercado Pago (${s.id}); cancelando.`);
      await cancelarNoMercadoPago(String(s.id));
    }
  }
}

// ── Cancelamento ────────────────────────────────────────────────────────────

/**
 * PUT com status cancelado, CONFERIDO. A documentação escreve "canceled" e os
 * SDKs do próprio Mercado Pago mandam "cancelled": tenta os dois. Só volta sem
 * erro quando o Mercado Pago mostra a assinatura cancelada — inclusive se ela
 * já estava (um PUT recusado por "já cancelada" não é falha). Sem essa
 * confirmação, lança: marcar "cancelada" aqui com o cartão ainda cobrando é o
 * pior resultado possível.
 */
async function cancelarNoMercadoPago(preapprovalId: string): Promise<void> {
  for (const grafia of ["cancelled", "canceled"]) {
    try {
      const r = (await atualizarAssinaturaMP(preapprovalId, { status: grafia })) as { status?: string };
      if (statusCancelado(r?.status)) return;
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      // 400: grafia recusada ou já cancelada → tenta a outra / confere abaixo.
      // Qualquer outra falha: vai direto conferir o estado real.
      if (status !== 400) break;
    }
  }
  const sub = (await preApprovalClient.get({ id: preapprovalId })) as AssinaturaMP;
  if (statusCancelado(sub.status)) return;
  throw new Error(`Mercado Pago não confirmou o cancelamento de ${preapprovalId} (status ${sub.status}).`);
}

/**
 * Devolve o cupom reservado ao assinar — só se nenhuma cobrança da assinatura
 * chegou a sair. A trava do banco (mensalidade contada) não basta: a cobrança
 * pode ter sido feita e ainda não processada (webhook atrasado). Por isso
 * olha as faturas no Mercado Pago antes; credita as aprovadas; e, na dúvida
 * (fatura com pagamento, ou erro ao consultar), não devolve.
 */
async function liberarReservaSeSeguro(admin: AdminClient, linha: LinhaAssinatura): Promise<void> {
  if (!linha.resgate_reservado_id) return;
  if (linha.mp_preapproval_id) {
    try {
      const faturas = await processarFaturas(admin, linha, false);
      if (faturas.some((f) => f.payment?.id !== undefined && f.payment?.id !== null)) return;
    } catch (err) {
      console.error(`[assinatura] faturas de ${linha.mp_preapproval_id} não conferidas; reserva de cupom mantida:`, err);
      return;
    }
  }
  await liberarReserva(admin, linha);
}

/**
 * Cancela a renovação. O acesso continua pelas datas: quem pagou até o dia 30
 * usa até o dia 30. Não tem volta no Mercado Pago — para voltar, assina de novo.
 */
export async function cancelarAssinaturaCartao(
  admin: AdminClient,
  linha: LinhaAssinatura,
  por: CanceladaPor
): Promise<void> {
  if (linha.situacao === "cancelada" || linha.situacao === "falhou") return;
  if (linha.mp_preapproval_id) {
    await cancelarNoMercadoPago(linha.mp_preapproval_id);
  }
  await atualizarLinha(admin, linha.id, {
    situacao: "cancelada",
    mp_status: linha.mp_preapproval_id ? "cancelled" : linha.mp_status,
    cancelada_em: agoraIso(),
    cancelada_por: por,
  });
  await liberarReservaSeSeguro(admin, linha);
}

/**
 * Cancela a assinatura viva da pessoa, se houver — antes de excluir a conta
 * ou de torná-la VIP/admin. Sem isto, o Mercado Pago seguiria cobrando alguém
 * que não tem mais conta (ou que não paga mais).
 *
 * Uma criação ainda sem resposta clara LANÇA erro: excluir ou dar VIP agora
 * deixaria uma assinatura que talvez exista cobrando sem ninguém ver. Quem
 * chama recusa a ação e ela é refeita em alguns minutos.
 */
export async function cancelarSeHouver(admin: AdminClient, userId: string, por: CanceladaPor): Promise<boolean> {
  const linha = await assinaturaViva(admin, userId);
  if (!linha) return false;
  if (linha.situacao === "criando") {
    const situacao = await resolverCriacaoPendente(admin, linha, new Date(Date.now() + ESPERA_CRIACAO_MS));
    if (situacao === "falhou") return false;
    if (situacao === "criando") {
      throw new Error(`Renovação automática de ${userId} ainda sendo confirmada pelo Mercado Pago; tente de novo em alguns minutos.`);
    }
    const ativa = await assinaturaViva(admin, userId);
    if (ativa) await cancelarAssinaturaCartao(admin, ativa, por);
    return true;
  }
  await cancelarAssinaturaCartao(admin, linha, por);
  return true;
}

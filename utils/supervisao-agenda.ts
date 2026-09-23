/**
 * Agenda de supervisões — regras puras, sem banco e sem criptografia, para a
 * tela, o feed do celular e o backup CSV lerem as supervisões do mesmo jeito.
 *
 * O psicólogo pode estar dos dois lados: "Eu supervisiono" (um colega traz
 * casos para ele, papel `supervisor`) ou "Sou supervisionado(a)" (ele leva os
 * próprios casos a um supervisor, papel `supervisionado`). O colega não tem
 * conta no sistema: é só um nome e, se quiser, um WhatsApp.
 *
 * Valor e "pago" ficam aqui dentro, sem passar pelo Financeiro (decisão do
 * dono em 23/09). O resumo do mês é calculado por papel, porque um lado é
 * dinheiro que entra e o outro é dinheiro que sai.
 *
 * Nesta camada tudo chega JÁ DECIFRADO. Cifrar e decifrar `observacoes` é
 * papel de quem lê e grava (app/components/supervisao-agenda-form-modal.tsx,
 * app/components/supervisoes-agenda.tsx e utils/export-backup.ts).
 */

import { numeroWhatsApp } from "./whatsapp";

export type PapelSupervisao = "supervisor" | "supervisionado";
export type StatusSupervisao = "agendada" | "realizada" | "cancelada";
export type ModalidadeSupervisao = "presencial" | "online";
export type FrequenciaRecorrencia = "semanal" | "quinzenal" | "mensal";

export interface SupervisaoAgenda {
  id: string;
  papel: PapelSupervisao;
  colega_nome: string;
  /** Só dígitos (DDD + número, com ou sem o 55). */
  colega_whatsapp: string | null;
  /** AAAA-MM-DD */
  data: string;
  /** HH:MM:SS, como o Postgres devolve um TIME. */
  horario: string;
  duracao_minutos: number;
  modalidade: ModalidadeSupervisao;
  status: StatusSupervisao;
  valor: number | null;
  pago: boolean;
  observacoes: string | null;
  serie_id: string | null;
  created_at?: string;
  updated_at?: string | null;
}

/** Colunas lidas da tabela: um lugar só, para a tela e o backup não divergirem. */
export const COLUNAS_SUPERVISAO_AGENDA =
  "id, papel, colega_nome, colega_whatsapp, data, horario, duracao_minutos, modalidade, status, valor, pago, observacoes, serie_id, created_at, updated_at";

// Os limites espelham as CHECKs de supabase/migrations/20260923140000_agenda_supervisoes.sql:
// a tela recusa antes, com mensagem legível, o que o banco recusaria com erro técnico.
export const COLEGA_NOME_MAX = 120;
export const DURACAO_MIN = 5;
export const DURACAO_MAX = 600;
export const DURACAO_PADRAO = 60;
export const REPETICOES_MAX = 52;
/** Atendimento sem duração gravada vale 50 min, o mesmo padrão do feed .ics. */
export const DURACAO_ATENDIMENTO_PADRAO = 50;

// ─── Rótulos ─────────────────────────────────────────────────────────────────

export function rotuloPapel(papel: PapelSupervisao): string {
  return papel === "supervisor" ? "Eu supervisiono" : "Sou supervisionado(a)";
}

/** O que o campo do nome significa em cada papel. */
export function rotuloColega(papel: PapelSupervisao): string {
  return papel === "supervisor" ? "Colega supervisionado(a)" : "Supervisor(a)";
}

export function rotuloStatus(status: StatusSupervisao): string {
  if (status === "realizada") return "Realizada";
  if (status === "cancelada") return "Cancelada";
  return "Agendada";
}

export function rotuloModalidade(modalidade: string | null | undefined): string {
  return modalidade === "online" ? "Online" : "Presencial";
}

/**
 * "Pago" tem sentido oposto em cada papel: quem supervisiona RECEBE, quem é
 * supervisionado PAGA. Um "Pago" genérico no lado do supervisor faria parecer
 * que ele pagou alguém.
 */
export function rotuloPago(papel: PapelSupervisao, pago: boolean): string {
  if (papel === "supervisor") return pago ? "Recebido" : "A receber";
  return pago ? "Pago" : "A pagar";
}

/**
 * Título no feed do celular. SEM o nome do colega: a URL do feed é pública e
 * passa por histórico de navegador, logs de proxy e backup do iPhone (ver A03
 * em app/calendario/[token]/route.ts). Modalidade desconhecida fica de fora do
 * título em vez de virar um "Presencial" inventado.
 */
export function tituloNoFeed(modalidade: string | null | undefined): string {
  if (modalidade === "online") return "Supervisão (Online)";
  if (modalidade === "presencial") return "Supervisão (Presencial)";
  return "Supervisão";
}

export function descricaoNoFeed(modalidade: string | null | undefined): string | null {
  if (modalidade !== "online" && modalidade !== "presencial") return null;
  return `Modalidade: ${rotuloModalidade(modalidade)}`;
}

// ─── Datas e horários ────────────────────────────────────────────────────────

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const HORARIO = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
const MES_ISO = /^(\d{4})-(\d{2})$/;

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * Hoje no fuso do navegador, em AAAA-MM-DD.
 *
 * Não usa toISOString(): ela converte para UTC, e no Brasil depois das 21h a
 * supervisão de hoje já apareceria entre as passadas.
 */
export function hojeLocal(agora: Date = new Date()): string {
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** AAAA-MM-DD → DD/MM/AAAA. Fora do formato devolve vazio, em vez de "Invalid Date". */
export function dataBR(iso: string | null | undefined): string {
  const partes = DATA_ISO.exec(iso ?? "");
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : "";
}

/** true só para uma data que existe no calendário ("2026-02-31" não passa). */
export function ehDataValida(iso: string | null | undefined): boolean {
  const partes = DATA_ISO.exec(iso ?? "");
  if (!partes) return false;
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** "14:30" ou "14:30:00" → 870. Fora do formato ou além de 23:59, null. */
export function minutosDoHorario(horario: string | null | undefined): number | null {
  const partes = HORARIO.exec(horario ?? "");
  if (!partes) return null;
  const h = Number(partes[1]);
  const m = Number(partes[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** "14:30:00" → "14:30". */
export function horarioCurto(horario: string | null | undefined): string {
  return (horario ?? "").slice(0, 5);
}

/** Horário em que termina. Passando da meia-noite, dá a volta no relógio. */
export function horarioFim(horario: string, duracaoMinutos: number): string {
  const inicio = minutosDoHorario(horario);
  if (inicio === null) return "";
  const fim = (((inicio + duracaoMinutos) % 1440) + 1440) % 1440;
  return `${String(Math.floor(fim / 60)).padStart(2, "0")}:${String(fim % 60).padStart(2, "0")}`;
}

/** "2026-09-23" → "2026-09". */
export function mesDaData(iso: string): string {
  return iso.slice(0, 7);
}

/** Primeiro e último dia de um mês "AAAA-MM", para a consulta por intervalo. */
export function intervaloDoMes(anoMes: string): { inicio: string; fim: string } {
  const partes = MES_ISO.exec(anoMes);
  if (!partes) throw new Error(`Mês fora do formato AAAA-MM: ${anoMes}`);
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { inicio: `${anoMes}-01`, fim: `${anoMes}-${String(ultimoDia).padStart(2, "0")}` };
}

/** Anda N meses a partir de "AAAA-MM" (negativo volta), atravessando o ano. */
export function deslocarMes(anoMes: string, delta: number): string {
  const partes = MES_ISO.exec(anoMes);
  if (!partes) throw new Error(`Mês fora do formato AAAA-MM: ${anoMes}`);
  const total = Number(partes[1]) * 12 + (Number(partes[2]) - 1) + delta;
  const ano = Math.floor(total / 12);
  const mes = total - ano * 12 + 1;
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/** "2026-09" → "setembro de 2026". */
export function rotuloMes(anoMes: string): string {
  const partes = MES_ISO.exec(anoMes);
  if (!partes) return anoMes;
  return `${MESES[Number(partes[2]) - 1]} de ${partes[1]}`;
}

// ─── Recorrência ─────────────────────────────────────────────────────────────

/**
 * As N datas de uma série, a primeira inclusa. N é o TOTAL de supervisões
 * (1 a 52) — "repetir 4 vezes" cria 4 linhas, não 5.
 *
 * O mensal parte sempre do dia original e encosta no último dia do mês quando
 * ele não existe: 31/01 → 28/02 → 31/03. Somar um mês à data anterior (como o
 * setMonth faz) empurraria 31/01 para 03/03 e, dali em diante, a série inteira
 * mudaria de dia sem ninguém perceber.
 *
 * As contas são em UTC: o dia do calendário não pode mudar por causa de
 * horário de verão ou do fuso da máquina.
 */
export function gerarDatasRecorrencia(
  dataInicial: string,
  frequencia: FrequenciaRecorrencia,
  vezes: number
): string[] {
  const partes = DATA_ISO.exec(dataInicial);
  if (!partes || !ehDataValida(dataInicial)) return [];
  const ano = Number(partes[1]);
  const mes = Number(partes[2]) - 1;
  const dia = Number(partes[3]);
  const total = Math.min(Math.max(Math.trunc(Number(vezes) || 1), 1), REPETICOES_MAX);

  const datas: string[] = [];
  for (let i = 0; i < total; i++) {
    let d: Date;
    if (frequencia === "mensal") {
      const ultimoDia = new Date(Date.UTC(ano, mes + i + 1, 0)).getUTCDate();
      d = new Date(Date.UTC(ano, mes + i, Math.min(dia, ultimoDia)));
    } else {
      const passo = frequencia === "quinzenal" ? 14 : 7;
      d = new Date(Date.UTC(ano, mes, dia + passo * i));
    }
    datas.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
    );
  }
  return datas;
}

// ─── Conflito de horário ─────────────────────────────────────────────────────

/** Qualquer coisa que ocupa a agenda: atendimento ou supervisão. */
export interface Compromisso {
  id: string;
  tipo: "atendimento" | "supervisao";
  data: string;
  horario: string;
  duracao_minutos: number | null;
  status: string;
}

export interface ConflitoNaData {
  data: string;
  compromissos: Compromisso[];
}

/** Cancelado não ocupa horário — nos dois vocabulários (agendamento e supervisão). */
function estaCancelado(status: string): boolean {
  return status === "cancelado" || status === "cancelada";
}

/**
 * Compromissos do mesmo dia cujo intervalo cruza o da supervisão.
 *
 * Intervalos meio-abertos: terminar às 15:00 e começar às 15:00 NÃO é
 * conflito — é a agenda de quem emenda um horário no outro.
 *
 * O aviso é só um aviso: quem decide se dá para encaixar é o psicólogo (ele
 * pode atender online do mesmo consultório, por exemplo). Por isso isto nunca
 * bloqueia a gravação.
 */
export function detectarConflitos(
  alvo: { id?: string | null; data: string; horario: string; duracao_minutos: number },
  compromissos: readonly Compromisso[]
): Compromisso[] {
  const inicio = minutosDoHorario(alvo.horario);
  if (inicio === null || !alvo.data) return [];
  const fim = inicio + Math.max(Number(alvo.duracao_minutos) || 0, 1);

  return compromissos.filter((c) => {
    if (c.data !== alvo.data) return false;
    if (alvo.id && c.tipo === "supervisao" && c.id === alvo.id) return false;
    if (estaCancelado(c.status)) return false;
    const outroInicio = minutosDoHorario(c.horario);
    if (outroInicio === null) return false;
    const outroFim =
      outroInicio + Math.max(Number(c.duracao_minutos) || DURACAO_ATENDIMENTO_PADRAO, 1);
    return inicio < outroFim && outroInicio < fim;
  });
}

/** O mesmo, para cada data de uma série. Só voltam as datas com conflito. */
export function conflitosNasDatas(
  datas: readonly string[],
  alvo: { id?: string | null; horario: string; duracao_minutos: number },
  compromissos: readonly Compromisso[]
): ConflitoNaData[] {
  return datas
    .map((data) => ({ data, compromissos: detectarConflitos({ ...alvo, data }, compromissos) }))
    .filter((c) => c.compromissos.length > 0);
}

// ─── Formulário ──────────────────────────────────────────────────────────────

/** Nome como vai para o banco: sem espaços sobrando, cortado no limite. */
export function normalizarColegaNome(valor: string | null | undefined): string {
  return (valor ?? "").trim().replace(/\s+/g, " ").slice(0, COLEGA_NOME_MAX);
}

/**
 * WhatsApp como vai para o banco: só dígitos, ou null.
 * Número que não abre conversa (incompleto, DDD inexistente) também vira null
 * — quem chama decide se isso é erro (ver validarSupervisao).
 */
export function normalizarWhatsApp(valor: string | null | undefined): string | null {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  return numeroWhatsApp(digitos) ? digitos.replace(/^0+/, "") : null;
}

/**
 * Valor digitado → número em reais, com duas casas.
 *
 * Aceita "150", "150,5", "1.234,56", "1.234" e "1234.56". Em branco é "sem
 * valor" (null), não zero: supervisão sem valor combinado não entra no resumo.
 * Zero é permitido — supervisão entre colegas, sem cobrança.
 */
export function lerValor(digitado: string | null | undefined): { valor: number | null; erro: string | null } {
  const limpo = (digitado ?? "").trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (!limpo) return { valor: null, erro: null };

  let normalizado = limpo;
  if (limpo.includes(",")) {
    // Vírgula é o decimal; os pontos, se houver, separam milhar — mas só no
    // padrão brasileiro. "1,234.56" (colado de planilha em inglês) virava
    // R$ 1,23 em silêncio, e "150,555" virava 150,56; agora são recusados.
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(limpo)) {
      return { valor: null, erro: "Valor inválido. Use o formato 1.500,00 ou 150,00." };
    }
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
    // "1.200" digitado em português é mil e duzentos, não um real e vinte.
    normalizado = limpo.replace(/\./g, "");
  }

  if (!/^\d+(\.\d+)?$/.test(normalizado)) {
    return { valor: null, erro: "Valor inválido. Use só números, como 150 ou 150,00." };
  }
  const n = Number(normalizado);
  if (!Number.isFinite(n) || n > 99_999_999.99) {
    return { valor: null, erro: "Valor inválido. Use só números, como 150 ou 150,00." };
  }
  return { valor: Math.round(n * 100) / 100, erro: null };
}

export interface FormSupervisao {
  colega_nome: string;
  colega_whatsapp: string;
  data: string;
  horario: string;
  duracao_minutos: number | string;
  valor: string;
  repetir: boolean;
  vezes: number | string;
}

/** O que impede salvar, em texto para a tela; null quando está tudo certo. */
export function validarSupervisao(form: FormSupervisao): string | null {
  const nome = normalizarColegaNome(form.colega_nome);
  if (!nome) return "Informe o nome do(a) colega.";
  if (form.colega_nome.trim().replace(/\s+/g, " ").length > COLEGA_NOME_MAX) {
    return `O nome pode ter até ${COLEGA_NOME_MAX} caracteres.`;
  }
  if (form.colega_whatsapp.trim() && !normalizarWhatsApp(form.colega_whatsapp)) {
    return "Confira o WhatsApp: DDD + número, como (11) 91234-5678. Ou deixe em branco.";
  }
  if (!ehDataValida(form.data)) return "Informe uma data válida.";
  if (minutosDoHorario(form.horario) === null) return "Informe o horário.";

  const duracao = Number(form.duracao_minutos);
  if (!Number.isInteger(duracao) || duracao < DURACAO_MIN || duracao > DURACAO_MAX) {
    return `A duração vai de ${DURACAO_MIN} a ${DURACAO_MAX} minutos.`;
  }

  const { erro } = lerValor(form.valor);
  if (erro) return erro;

  if (form.repetir) {
    const vezes = Number(form.vezes);
    if (!Number.isInteger(vezes) || vezes < 2 || vezes > REPETICOES_MAX) {
      return `Para repetir, escolha de 2 a ${REPETICOES_MAX} supervisões no total.`;
    }
  }
  return null;
}

// ─── Leitura do banco ────────────────────────────────────────────────────────

/**
 * NUMERIC pode chegar como número ou como texto, conforme o caminho. A tela
 * soma valores: um "150.00" em texto viraria "0150.00" na soma.
 */
export function valorNumerico(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Linha crua do banco → SupervisaoAgenda com os tipos que a tela espera. */
export function normalizarLinha(linha: Record<string, unknown>): SupervisaoAgenda {
  return {
    id: String(linha.id),
    papel: linha.papel === "supervisionado" ? "supervisionado" : "supervisor",
    colega_nome: String(linha.colega_nome ?? ""),
    colega_whatsapp: (linha.colega_whatsapp as string | null) ?? null,
    data: String(linha.data ?? ""),
    horario: String(linha.horario ?? ""),
    duracao_minutos: Number(linha.duracao_minutos) || DURACAO_PADRAO,
    modalidade: linha.modalidade === "online" ? "online" : "presencial",
    status:
      linha.status === "realizada" || linha.status === "cancelada"
        ? (linha.status as StatusSupervisao)
        : "agendada",
    valor: valorNumerico(linha.valor),
    pago: linha.pago === true,
    observacoes: (linha.observacoes as string | null) ?? null,
    serie_id: (linha.serie_id as string | null) ?? null,
    created_at: (linha.created_at as string | undefined) ?? undefined,
    updated_at: (linha.updated_at as string | null | undefined) ?? null,
  };
}

// ─── Listas e resumo ─────────────────────────────────────────────────────────

/** Por data e, no mesmo dia, por horário. `desc` inverte só as datas. */
export function ordenarPorDataHora<T extends { data: string; horario: string }>(
  lista: readonly T[],
  ordem: "asc" | "desc" = "asc"
): T[] {
  return [...lista].sort((a, b) => {
    const porData = ordem === "asc" ? a.data.localeCompare(b.data) : b.data.localeCompare(a.data);
    return porData || a.horario.localeCompare(b.horario);
  });
}

/** Grupos por data, na ordem pedida; dentro do dia, sempre pelo horário. */
export function agruparPorData<T extends { data: string; horario: string }>(
  lista: readonly T[],
  ordem: "asc" | "desc" = "asc"
): Array<{ data: string; itens: T[] }> {
  const grupos: Array<{ data: string; itens: T[] }> = [];
  for (const item of ordenarPorDataHora(lista, ordem)) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.data === item.data) ultimo.itens.push(item);
    else grupos.push({ data: item.data, itens: [item] });
  }
  return grupos;
}

/** O que aparece no calendário de Atendimentos: supervisão cancelada não ocupa o dia. */
export function visiveisNoCalendario<T extends { status: string }>(lista: readonly T[]): T[] {
  return lista.filter((s) => s.status !== "cancelada");
}

export interface TotaisDoLado {
  /** Soma de tudo que tem valor no mês (sem as canceladas). */
  total: number;
  /** Ainda não recebido (supervisor) ou não pago (supervisionado). */
  pendente: number;
  /** Já recebido (supervisor) ou já pago (supervisionado). */
  quitado: number;
  qtdPendentes: number;
}

export interface ResumoDoMes {
  /** Supervisões que você dá: dinheiro que entra. */
  aReceber: TotaisDoLado;
  /** Supervisões que você recebe: dinheiro que sai. */
  aPagar: TotaisDoLado;
}

/**
 * Resumo financeiro de um mês "AAAA-MM", separado por papel.
 *
 * Fica de fora: cancelada (não vai ser cobrada), sem valor (nada combinado) e
 * valor zero (supervisão sem cobrança — contar como "pendente" faria alguém
 * cobrar o que não existe). As agendadas para mais adiante no mês ENTRAM: é o
 * que ainda vai entrar ou sair neste mês.
 *
 * Centavos somados em inteiro: 0,1 + 0,2 em ponto flutuante não fecha 0,3, e
 * um resumo de dinheiro que mostra R$ 0,30000000000000004 perde a confiança.
 */
export function resumoFinanceiroDoMes(
  lista: readonly Pick<SupervisaoAgenda, "papel" | "data" | "status" | "valor" | "pago">[],
  anoMes: string
): ResumoDoMes {
  const vazio = () => ({ total: 0, pendente: 0, quitado: 0, qtdPendentes: 0 });
  const centavos = { supervisor: vazio(), supervisionado: vazio() };

  for (const s of lista) {
    if (mesDaData(s.data) !== anoMes) continue;
    if (s.status === "cancelada") continue;
    const valor = valorNumerico(s.valor);
    if (valor === null || valor <= 0) continue;

    const c = Math.round(valor * 100);
    const lado = centavos[s.papel === "supervisionado" ? "supervisionado" : "supervisor"];
    lado.total += c;
    if (s.pago) {
      lado.quitado += c;
    } else {
      lado.pendente += c;
      lado.qtdPendentes += 1;
    }
  }

  const emReais = (t: TotaisDoLado): TotaisDoLado => ({
    total: t.total / 100,
    pendente: t.pendente / 100,
    quitado: t.quitado / 100,
    qtdPendentes: t.qtdPendentes,
  });
  return { aReceber: emReais(centavos.supervisor), aPagar: emReais(centavos.supervisionado) };
}

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 1234.5 → "R$ 1.234,50" (com espaço sem quebra, como o Intl devolve). */
export function formatarMoeda(valor: number): string {
  return MOEDA.format(valor);
}

// ─── Backup CSV ──────────────────────────────────────────────────────────────

export interface LinhaSupervisaoAgendaBackup {
  data: string;
  horario: string;
  duracao: string;
  papel: string;
  colega: string;
  whatsapp: string;
  modalidade: string;
  status: string;
  valor: string;
  situacaoPagamento: string;
  serie: string;
  observacoes: string;
}

/**
 * Linhas da seção de supervisões do backup CSV, da mais recente para a mais
 * antiga (como as outras seções do backup), com os mesmos rótulos da tela —
 * o CSV é lido por gente, não por programa.
 */
export function linhasSupervisaoAgendaParaBackup(
  lista: readonly SupervisaoAgenda[]
): LinhaSupervisaoAgendaBackup[] {
  return ordenarPorDataHora(lista, "desc").map((s) => {
    const valor = valorNumerico(s.valor);
    return {
      data: dataBR(s.data),
      horario: horarioCurto(s.horario),
      duracao: `${s.duracao_minutos} min`,
      papel: rotuloPapel(s.papel),
      colega: s.colega_nome,
      whatsapp: s.colega_whatsapp ?? "",
      modalidade: rotuloModalidade(s.modalidade),
      status: rotuloStatus(s.status),
      valor: valor === null ? "" : formatarMoeda(valor),
      situacaoPagamento: valor === null || valor <= 0 ? "" : rotuloPago(s.papel, s.pago),
      serie: s.serie_id ? "Sim" : "Não",
      observacoes: s.observacoes ?? "",
    };
  });
}

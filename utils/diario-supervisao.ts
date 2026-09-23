/**
 * Comentários de supervisão do Diário de Bordo — regras puras, sem banco e sem
 * criptografia, para a tela e o backup CSV lerem os comentários do mesmo jeito.
 *
 * O psicólogo registra aqui o que ouviu na supervisão com outro psicólogo: o
 * "outro olhar" sobre a sessão anotada. Quem escreve é sempre o próprio
 * psicólogo — o supervisor não tem acesso ao sistema. Vários comentários por
 * anotação, cada um com a data da supervisão e, se quiser, o nome de quem
 * supervisionou.
 *
 * Nesta camada tudo chega JÁ DECIFRADO. Cifrar e decifrar é papel de quem lê e
 * grava (app/components/diario-supervisao.tsx e utils/export-backup.ts).
 */

import { ehCifrado } from "./crypto";

export interface ComentarioSupervisao {
  id: string;
  diario_id: string;
  /** AAAA-MM-DD — data em que a supervisão aconteceu, não a do registro. */
  data_supervisao: string;
  supervisor: string | null;
  conteudo: string;
  created_at: string;
  updated_at?: string | null;
  /**
   * Só na tela, nunca vai ao banco: o comentário está cifrado e não pôde ser
   * aberto nesta carga (ver decifragemFalhou). Não pode ser editado.
   */
  ilegivel?: boolean;
}

/** Colunas lidas da tabela: um lugar só, para a tela e o backup não divergirem. */
export const COLUNAS_SUPERVISAO =
  "id, diario_id, data_supervisao, supervisor, conteudo, created_at, updated_at";

/** Tamanho máximo do nome do supervisor no formulário. */
export const SUPERVISOR_MAX = 120;

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Hoje no fuso do navegador, em AAAA-MM-DD.
 *
 * Não usa toISOString(): ela converte para UTC, e no Brasil depois das 21h o
 * formulário sugeriria a data de amanhã.
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

/** Nome do supervisor como vai para o banco: sem espaços nas pontas, vazio vira null. */
export function normalizarSupervisor(valor: string | null | undefined): string | null {
  const limpo = (valor ?? "").trim().replace(/\s+/g, " ");
  return limpo ? limpo.slice(0, SUPERVISOR_MAX) : null;
}

/**
 * O que impede salvar, em texto para a tela; null quando está tudo certo.
 *
 * Data futura é recusada: o comentário registra uma supervisão que JÁ
 * aconteceu, e uma data adiante quase sempre é erro de digitação — que depois
 * embaralharia a ordem dos comentários.
 */
export function validarComentario(
  form: { data: string; conteudo: string },
  hoje: string = hojeLocal()
): string | null {
  const partes = DATA_ISO.exec(form.data);
  if (!partes) return "Informe a data da supervisão.";
  // "2026-02-31" passa na expressão regular; o Date normaliza para março e denuncia.
  const [, ano, mes, dia] = partes.map(Number);
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    return "Informe uma data de supervisão válida.";
  }
  // Comparação de texto funciona porque as duas datas estão em AAAA-MM-DD.
  if (form.data > hoje) return "A data da supervisão não pode ser no futuro.";
  if (!form.conteudo.trim()) return "Escreva o comentário da supervisão.";
  return null;
}

/**
 * Ordem de leitura dentro de uma anotação: da supervisão mais antiga para a
 * mais recente, como uma conversa. Na mesma data, vale a ordem de registro.
 */
export function ordenarComentarios<T extends Pick<ComentarioSupervisao, "data_supervisao" | "created_at">>(
  lista: readonly T[]
): T[] {
  return [...lista].sort(
    (a, b) =>
      a.data_supervisao.localeCompare(b.data_supervisao) ||
      (a.created_at ?? "").localeCompare(b.created_at ?? "")
  );
}

/**
 * Lista de uma anotação com o comentário recém-gravado (novo ou editado) no
 * lugar certo da ordem.
 *
 * Existe para a tela atualizar o estado com setState(prev => …): montar a
 * lista a partir da prop capturada no clique fazia um comentário excluído
 * reaparecer quando um salvar terminava depois de um excluir.
 */
export function comComentario<T extends Pick<ComentarioSupervisao, "id" | "data_supervisao" | "created_at">>(
  lista: readonly T[] | undefined,
  comentario: T
): T[] {
  return ordenarComentarios([...(lista ?? []).filter((c) => c.id !== comentario.id), comentario]);
}

/** Lista de uma anotação sem o comentário excluído (mesmo motivo de comComentario). */
export function semComentario<T extends Pick<ComentarioSupervisao, "id">>(
  lista: readonly T[] | undefined,
  id: string
): T[] {
  return (lista ?? []).filter((c) => c.id !== id);
}

/**
 * Texto que decryptClinicalData (utils/crypto.ts) devolve NO LUGAR do dado
 * quando não consegue abri-lo — chave que não chegou, sessão caída, rede.
 *
 * Lá ele não é exportado, então a comparação aqui é pelo texto. Se a mensagem
 * mudar em crypto.ts, precisa mudar aqui também: o teste de
 * tests/diario-supervisao.test.ts decifra um valor inválido e confere que os
 * dois continuam iguais.
 */
export const AVISO_CHAVE_INDISPONIVEL = "[Conteúdo protegido - Chave indisponível]";

/**
 * true quando um campo que está cifrado no banco NÃO foi aberto: a decifragem
 * devolveu o aviso acima, ou o próprio valor cifrado (formato quebrado, que
 * decryptClinicalData também devolve como está).
 *
 * Por que importa: o formulário de edição mostraria o aviso como se fosse o
 * comentário, e salvar cifraria o aviso POR CIMA do comentário verdadeiro —
 * perda sem volta. Valor em claro no banco (registro antigo) nunca conta como
 * falha, mesmo que por acaso tenha o texto do aviso.
 *
 * Só olha o formato (ehCifrado), não cifra nem decifra nada.
 */
export function decifragemFalhou(
  noBanco: string | null | undefined,
  decifrado: string | null | undefined
): boolean {
  if (!ehCifrado(noBanco)) return false;
  return decifrado === AVISO_CHAVE_INDISPONIVEL || ehCifrado(decifrado);
}

/**
 * Algum dos textos do formulário é o aviso de chave indisponível. Última
 * barreira antes de gravar: se o aviso chegou ao formulário por qualquer
 * caminho, gravá-lo apagaria o comentário verdadeiro.
 */
export function contemAvisoDeChave(...textos: (string | null | undefined)[]): boolean {
  return textos.some((t) => (t ?? "").trim() === AVISO_CHAVE_INDISPONIVEL);
}

/** Comentários agrupados pela anotação a que pertencem, já em ordem de leitura. */
export function agruparPorAnotacao<T extends ComentarioSupervisao>(
  lista: readonly T[]
): Record<string, T[]> {
  const grupos: Record<string, T[]> = {};
  for (const c of ordenarComentarios(lista)) {
    (grupos[c.diario_id] ??= []).push(c);
  }
  return grupos;
}

/**
 * Filtro por texto do diário: a anotação aparece se o termo estiver no texto
 * dela OU em algum comentário de supervisão pendurado nela — o "outro olhar"
 * também é conteúdo do caso. Sem termo, tudo passa.
 *
 * Não confundir com o Radar de Temas: ele continua extraindo palavras só das
 * anotações (utils/clinical-analyzer.ts). Isto aqui só decide o que aparece
 * quando um tema é clicado.
 */
export function anotacaoCorrespondeAoTermo(
  conteudo: string | null | undefined,
  comentarios: readonly Pick<ComentarioSupervisao, "conteudo">[] | undefined,
  termo: string | null | undefined
): boolean {
  const alvo = (termo ?? "").trim().toLowerCase();
  if (!alvo) return true;
  if ((conteudo ?? "").toLowerCase().includes(alvo)) return true;
  return (comentarios ?? []).some((c) => (c.conteudo ?? "").toLowerCase().includes(alvo));
}

/** Começo de um texto numa linha só, para identificar a anotação no backup. */
export function trechoInicial(texto: string | null | undefined, max = 60): string {
  const linha = (texto ?? "").replace(/\s+/g, " ").trim();
  return linha.length > max ? `${linha.slice(0, max - 1).trimEnd()}…` : linha;
}

export interface AnotacaoParaBackup {
  paciente: string;
  /** AAAA-MM-DD */
  data: string;
  conteudo: string;
}

export interface LinhaSupervisaoBackup {
  paciente: string;
  dataNota: string;
  trechoNota: string;
  dataSupervisao: string;
  supervisor: string;
  comentario: string;
  created_at: string;
}

/**
 * Linhas da seção de supervisão do backup CSV, ligadas à anotação e ao
 * paciente. A anotação vai identificada por data e pelo começo do texto,
 * porque o mesmo paciente pode ter mais de uma nota no mesmo dia.
 *
 * Ordem igual à da tela: paciente, anotação mais recente primeiro e, dentro
 * dela, os comentários em ordem de supervisão. Comentário cuja anotação não
 * veio na leitura continua no backup — perder dado clínico em silêncio é pior
 * que uma linha sem contexto.
 */
export function linhasSupervisaoParaBackup(
  comentarios: readonly ComentarioSupervisao[],
  anotacoes: ReadonlyMap<string, AnotacaoParaBackup>
): LinhaSupervisaoBackup[] {
  return ordenarComentarios(comentarios)
    .map((c) => {
      const nota = anotacoes.get(c.diario_id);
      return {
        chaveData: nota?.data ?? "",
        linha: {
          paciente: nota?.paciente || "Paciente",
          dataNota: nota ? dataBR(nota.data) : "",
          trechoNota: nota ? trechoInicial(nota.conteudo) : "(anotação não encontrada)",
          dataSupervisao: dataBR(c.data_supervisao),
          supervisor: c.supervisor ?? "",
          comentario: c.conteudo,
          created_at: c.created_at,
        },
        diarioId: c.diario_id,
      };
    })
    // sort é estável: o empate preserva a ordem de supervisão feita acima.
    .sort(
      (a, b) =>
        a.linha.paciente.localeCompare(b.linha.paciente, "pt-BR") ||
        b.chaveData.localeCompare(a.chaveData) ||
        a.diarioId.localeCompare(b.diarioId)
    )
    .map((x) => x.linha);
}

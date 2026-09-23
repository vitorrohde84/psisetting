/**
 * Marcadores de modelo que ficaram sem preencher no texto de um documento —
 * "[Nome do Paciente]", "[CPF/RG]", "[semanal / quinzenal]"…
 *
 * Um documento emitido com esses campos em aberto vai para a escola, o
 * empregador ou o juízo com lacunas. O termo de responsabilidade lista o que
 * sobrou para a pessoa decidir; não bloqueia.
 *
 * Duas regras, porque uma só não serve:
 * - os marcadores dos próprios modelos (utils/laudo-templates.ts) são
 *   reconhecidos com qualquer tamanho — vários "[descrever …]" passam de 100
 *   caracteres e escapariam de um limite fixo;
 * - fora deles, vale um colchete curto (2 a 60 caracteres, numa linha só, com
 *   pelo menos uma letra), que pega marcador digitado pela pessoa ou de versão
 *   antiga do modelo. As convenções de citação — "[sic]", "[...]" — e números
 *   de referência ("[1]") não são marcadores e ficam de fora.
 */

import { CFP_TEMPLATES } from "./laudo-templates";

const COLCHETE = /\[[^\]\n]+\]/g;
const LETRA = /\p{L}/u;
// Convenções de transcrição/citação que um relatório pode ter de propósito.
const CONVENCOES = new Set(["sic", "sic.", "...", "…", "(...)", "(…)"]);

// Montados sem dados: tudo que o modelo não sabe preencher vira marcador.
const MARCADORES_DOS_MODELOS: ReadonlySet<string> = new Set(
  CFP_TEMPLATES.flatMap((t) => t.buildConteudo({}).match(COLCHETE) ?? [])
);

function ehMarcador(trecho: string): boolean {
  if (MARCADORES_DOS_MODELOS.has(trecho)) return true;
  const miolo = trecho.slice(1, -1);
  const limpo = miolo.trim();
  if (limpo.length < 2 || miolo.length > 60) return false;
  if (CONVENCOES.has(limpo.toLowerCase())) return false;
  return LETRA.test(limpo);
}

/** Marcadores ainda no texto, sem repetição, na ordem em que aparecem. */
export function marcadoresPendentes(conteudo: string | null | undefined): string[] {
  const vistos = new Set<string>();
  for (const trecho of conteudo?.match(COLCHETE) ?? []) {
    if (!vistos.has(trecho) && ehMarcador(trecho)) vistos.add(trecho);
  }
  return [...vistos];
}

/**
 * O que cabe no aviso: os primeiros `limite` marcadores, encurtados para não
 * virar um parágrafo, e quantos ficaram de fora ("e mais N").
 */
export function resumirMarcadores(
  marcadores: string[],
  limite = 6,
  tamanhoMaximo = 60
): { exibir: string[]; restantes: number } {
  return {
    exibir: marcadores.slice(0, limite).map((m) => encurtarMarcador(m, tamanhoMaximo)),
    restantes: Math.max(0, marcadores.length - limite),
  };
}

/** "[descrever a evolução do paciente, …]" — mantém os colchetes para ser reconhecível. */
export function encurtarMarcador(marcador: string, tamanhoMaximo = 60): string {
  if (marcador.length <= tamanhoMaximo) return marcador;
  const miolo = marcador.slice(1, -1).slice(0, Math.max(1, tamanhoMaximo - 3)).trimEnd();
  return `[${miolo}…]`;
}

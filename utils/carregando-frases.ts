/**
 * Frases exibidas pelo carregamento (app/components/carregando.tsx).
 *
 * A primeira é a mais informativa e é a que aparece nas esperas curtas, que
 * são a maioria. As outras só surgem se a espera se alonga.
 */

export const FRASE_PADRAO = "Preparando o seu setting…";

// Só é verdadeira onde a tela abre dado clínico cifrado com a chave do próprio
// psicólogo (ver SPEC.md, seção 5). Em pagamento ou configuração, não é.
export const FRASE_CHAVE = "Abrindo com a sua chave…";

// Não "Quase pronto": as frases giram sem saber quanto falta, e prometer
// progresso numa espera longa seria faltar com a verdade.
export const FRASE_ESPERA = "Só um instante…";

export function frasesDoCarregamento(mensagem?: string, dadosClinicos = false): string[] {
  return [mensagem ?? FRASE_PADRAO, ...(dadosClinicos ? [FRASE_CHAVE] : []), FRASE_ESPERA];
}

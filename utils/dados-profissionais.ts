/**
 * Dados do profissional que um documento (laudo, declaração, atestado,
 * relatório) precisa para ser emitido.
 *
 * O documento impresso leva o nome e o CRP na assinatura e a cidade na linha
 * "Cidade, data". Sem eles o papel sai sem dizer quem assina — e, antes desta
 * regra, saía com os dados de outra psicóloga como valor padrão. Por isso a
 * impressão é barrada enquanto faltar qualquer um deles.
 *
 * Telefone e endereço vão só no rodapé e são opcionais: sem eles o rodapé
 * mostra o que houver, ou some.
 */

export interface DadosProfissionais {
  nome?: string | null;
  nome_completo?: string | null;
  crp?: string | null;
  cidade?: string | null;
  telefone?: string | null;
  endereco?: string | null;
}

export type CampoObrigatorio = "nome" | "crp" | "cidade";

export interface CampoFaltando {
  campo: CampoObrigatorio;
  /** Como o campo aparece no aviso: "Para emitir documentos, preencha: …". */
  rotulo: string;
}

/**
 * Valor do perfil pronto para exibir. O formulário grava `null` quando o campo
 * fica vazio, mas registro antigo pode ter "" ou só espaços — tudo vira "".
 */
export function texto(valor: string | null | undefined): string {
  return valor?.trim() ?? "";
}

/**
 * Campos obrigatórios que faltam, na ordem em que aparecem no documento.
 *
 * O nome aceita `nome_completo` OU `nome`: a assinatura usa o completo e cai
 * no curto quando ele não existe — qualquer um dos dois identifica quem assina.
 * Perfil ausente (não carregou) conta como tudo faltando: melhor pedir os dados
 * do que imprimir um documento sem autor.
 */
export function camposFaltando(perfil: DadosProfissionais | null | undefined): CampoFaltando[] {
  const faltando: CampoFaltando[] = [];
  if (!texto(perfil?.nome_completo) && !texto(perfil?.nome)) {
    faltando.push({ campo: "nome", rotulo: "nome completo" });
  }
  if (!texto(perfil?.crp)) faltando.push({ campo: "crp", rotulo: "CRP" });
  if (!texto(perfil?.cidade)) faltando.push({ campo: "cidade", rotulo: "cidade" });
  return faltando;
}

/** "CRP", "CRP e cidade", "nome completo, CRP e cidade". */
export function juntarRotulos(faltando: CampoFaltando[]): string {
  const rotulos = faltando.map((f) => f.rotulo);
  if (rotulos.length <= 1) return rotulos.join("");
  return `${rotulos.slice(0, -1).join(", ")} e ${rotulos[rotulos.length - 1]}`;
}

/**
 * Partes do rodapé do documento. Só entra o que o profissional preencheu —
 * nunca um endereço ou telefone "de exemplo", que no papel impresso passaria
 * por contato verdadeiro. Lista vazia = sem rodapé.
 */
export function itensRodape(perfil: Pick<DadosProfissionais, "endereco" | "telefone">): string[] {
  const itens: string[] = [];
  const endereco = texto(perfil.endereco);
  const telefone = texto(perfil.telefone);
  if (endereco) itens.push(`End: ${endereco}`);
  if (telefone) itens.push(`Contato: ${telefone}`);
  return itens;
}

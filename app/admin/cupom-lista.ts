import type { TipoCupom } from "../../utils/cupom-admin";
import {
  PRECO_BASE,
  aplicarDesconto,
  descreverDesconto,
  descreverDuracaoCupom,
  ehTipoDesconto,
  formatarReais,
} from "../../utils/preco-desconto";

/**
 * Textos da aba Cupons do painel admin — funções puras, fora do page.tsx para
 * poderem ser testadas (a página do App Router só pode exportar o componente).
 *
 * Imports relativos, não "@/": os testes rodam no vitest sem o alias.
 */

/** Uma pessoa que resgatou o cupom, como GET /api/admin/coupons devolve. */
export interface ResgateCupom {
  resgateId: string;
  nome: string | null;
  email: string | null;
  desde: string | null;
  usadas: number;
  duracaoMeses: number | null;
  paraSempre: boolean;
  restantes: number | null;
  encerrado: boolean;
  emUso: boolean;
}

export interface CupomAdmin {
  id: string;
  code: string;
  discount_type: TipoCupom;
  discount_value: number;
  trial_days: number | null;
  // Opcionais: antes da migração 20260923120000 as colunas não existem.
  duracao_meses?: number | null;
  para_sempre?: boolean | null;
  max_uses: number | null;
  uses_count: number | null;
  expires_at: string | null;
  active: boolean;
  usuarios?: ResgateCupom[];
  emUso?: number;
  totalResgates?: number;
}

/** Data no fuso de Brasília — a validade do cupom é 23h59 daqui. */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function duracaoDoCupom(c: CupomAdmin): number | null {
  // Sem a coluna (antes da migração), o cupom vale 1 mês — o padrão do banco.
  return c.para_sempre ? null : Number(c.duracao_meses) || 1;
}

/** "20% OFF por 3 meses (R$ 27,92/mês)" */
export function descreverBeneficio(c: CupomAdmin): string {
  if (c.discount_type === "vip") return "Acesso VIP Vitalício (100% Grátis)";
  if (!ehTipoDesconto(c.discount_type)) {
    return `+${c.trial_days || c.discount_value || 30} dias grátis de teste`;
  }

  const valor = Number(c.discount_value);
  const duracao = duracaoDoCupom(c);
  const final = formatarReais(aplicarDesconto(PRECO_BASE, c.discount_type, valor));
  // Desconto de uma mensalidade só não é "por mês".
  const preco = duracao === 1 ? `R$ ${final}` : `R$ ${final}/mês`;
  return `${descreverDesconto(c.discount_type, valor)} ${descreverDuracaoCupom(duracao)} (${preco})`;
}

/** "2 em uso agora · 5 resgates no total · limite de 10 · vale até 31/10/2026" */
export function descreverUsoDoCupom(c: CupomAdmin): string {
  const total = c.totalResgates ?? 0;
  const partes: string[] = [];
  // Dias de teste e VIP são concedidos na hora: não há "em uso".
  if (ehTipoDesconto(c.discount_type)) partes.push(`${c.emUso ?? 0} em uso agora`);
  partes.push(`${total} ${total === 1 ? "resgate" : "resgates"} no total`);
  if (c.max_uses) partes.push(`limite de ${c.max_uses}`);
  if (c.expires_at) partes.push(`vale até ${formatarData(c.expires_at)}`);
  return partes.join(" · ");
}

export type Situacao = "resgatado" | "concluido" | "encerrado" | "em_uso";

/**
 * Situação de quem resgatou. "Concluído" vem antes de "encerrado": encerrar para
 * todos também marca quem já tinha usado todas as mensalidades, e para essa
 * pessoa o que aconteceu de fato foi concluir.
 */
export function situacaoDoResgate(
  u: ResgateCupom,
  cupomDeDesconto: boolean
): { situacao: Situacao; texto: string } {
  if (!cupomDeDesconto) return { situacao: "resgatado", texto: "resgatado" };
  if (!u.paraSempre && u.restantes === 0) return { situacao: "concluido", texto: "concluído" };
  if (u.encerrado) return { situacao: "encerrado", texto: "encerrado" };
  if (u.paraSempre) return { situacao: "em_uso", texto: "para sempre" };

  const total = u.duracaoMeses ?? 1;
  return {
    situacao: "em_uso",
    texto: `${u.usadas} de ${total} ${total === 1 ? "mensalidade usada" : "mensalidades usadas"}`,
  };
}

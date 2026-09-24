import type { SupabaseClient } from "@supabase/supabase-js";
import { descontosEmUso, escolherMelhorDesconto, type DescontoAplicado } from "./preco-assinatura";
import { PRECO_BASE } from "./preco-desconto";
import { renovacaoParaTela, type RenovacaoTela } from "./assinatura-cartao";

/**
 * Cupom em uso e forma do último pagamento de cada conta — para o painel admin
 * (lista de psicólogos, gaveta de detalhes e receita mensal).
 *
 * Usa a mesma regra do preço cobrado (foto do resgate, mensalidades restantes,
 * vence o menor preço). Antes as métricas ligavam cada resgate ao cupom ATUAL
 * e aplicavam o desconto para sempre: quem usou um cupom de 1 mês em agosto
 * entrava na receita com desconto até hoje.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, any, any>;

export interface CupomEmUsoAdmin {
  codigo: string;
  tipo: DescontoAplicado["tipo"];
  valor: number;
  paraSempre: boolean;
  restantes: number | null;
  duracaoMeses: number | null;
  valorFinal: number;
}

export type MeioAdmin = "pix" | "cartao" | "cartao_automatico";

export interface AssinaturaAdmin {
  cupomEmUso: CupomEmUsoAdmin | null;
  ultimoMeio: MeioAdmin | null;
  ultimoPagamentoEm: string | null;
  /** Renovação automática no cartão (ativa, sendo criada ou cancelada há pouco). */
  renovacao: RenovacaoTela | null;
}

const MEIOS: readonly string[] = ["pix", "cartao", "cartao_automatico"];

export async function carregarAssinaturasAdmin(
  adminClient: AdminClient
): Promise<Record<string, AssinaturaAdmin>> {
  const resultado: Record<string, AssinaturaAdmin> = {};
  const garantir = (id: string) =>
    (resultado[id] ??= { cupomEmUso: null, ultimoMeio: null, ultimoPagamentoEm: null, renovacao: null });

  const { data: resgates, error: resgatesError } = await adminClient
    .from("coupon_redemptions")
    .select(
      "profile_id, coupon_id, desconto_tipo, desconto_valor, duracao_meses, para_sempre, mensalidades_usadas, encerrado_em, coupons(code)"
    )
    .in("desconto_tipo", ["percent", "fixed"]);

  if (resgatesError) {
    // Antes da migração 20260923120000: sem foto, sem cupom em uso.
    console.error("[admin] não foi possível ler os cupons em uso:", resgatesError.message);
  } else {
    const porConta: Record<string, typeof resgates> = {};
    for (const r of resgates ?? []) (porConta[r.profile_id] ??= []).push(r);

    for (const [perfilId, linhas] of Object.entries(porConta)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const melhor = escolherMelhorDesconto(descontosEmUso(linhas as any, PRECO_BASE));
      if (!melhor) continue;
      garantir(perfilId).cupomEmUso = {
        codigo: melhor.code,
        tipo: melhor.tipo,
        valor: melhor.valor,
        paraSempre: melhor.paraSempre,
        restantes: melhor.restantes,
        duracaoMeses: melhor.duracaoMeses,
        valorFinal: melhor.valorFinal,
      };
    }
  }

  const { data: eventos, error: eventosError } = await adminClient
    .from("payment_events")
    .select("user_id, meio, processed_at, revertido_em")
    .order("processed_at", { ascending: false });

  if (eventosError) {
    console.error("[admin] não foi possível ler os pagamentos:", eventosError.message);
  } else {
    for (const e of eventos ?? []) {
      if (!e.user_id || e.revertido_em) continue;
      const a = garantir(e.user_id);
      if (a.ultimoPagamentoEm) continue; // já tem o mais recente
      a.ultimoPagamentoEm = e.processed_at;
      a.ultimoMeio = MEIOS.includes(e.meio) ? (e.meio as MeioAdmin) : null;
    }
  }

  // A mais recente de cada conta (as que falharam ao criar não contam).
  const { data: renovacoes, error: renovacoesError } = await adminClient
    .from("assinaturas_cartao")
    .select(
      "user_id, situacao, valor_atual, proxima_cobranca, primeira_cobranca, cartao_final, cartao_bandeira, ultima_recusa_em, cancelada_em, cancelada_por, criada_em"
    )
    .neq("situacao", "falhou")
    .order("criada_em", { ascending: false });

  if (renovacoesError) {
    // Antes da migração 20260923150000: ninguém tem renovação automática.
    console.error("[admin] não foi possível ler as renovações automáticas:", renovacoesError.message);
  } else {
    const vistos = new Set<string>();
    for (const r of renovacoes ?? []) {
      if (!r.user_id || vistos.has(r.user_id)) continue;
      vistos.add(r.user_id);
      const tela = renovacaoParaTela(r);
      if (tela) garantir(r.user_id).renovacao = tela;
    }
  }

  return resultado;
}

/**
 * Quanto a conta paga por mês hoje, para a receita mensal do painel. Na
 * renovação automática vale o valor que está no Mercado Pago — é o que será
 * cobrado, mesmo que a subida para o preço cheio ainda não tenha acontecido.
 */
export function precoMensalDaConta(a: AssinaturaAdmin | undefined): number {
  if (a?.renovacao?.situacao === "ativa" && a.renovacao.valor !== null) return a.renovacao.valor;
  return a?.cupomEmUso?.valorFinal ?? PRECO_BASE;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PRECO_BASE,
  aplicarDesconto,
  descreverDesconto,
  descreverPrecoComDesconto,
  ehTipoDesconto,
  mensalidadesRestantes,
  type TipoDesconto,
} from "./preco-desconto";
import {
  MENSAGEM_CUPOM_INVALIDO,
  normalizarCodigo,
  resolverDescontoDeCupom,
} from "./coupons";

/**
 * Quanto este psicólogo paga AGORA — decidido só no servidor.
 *
 * Usado pela tela (GET /api/subscription/preco e /api/coupons/apply) e pelas
 * rotas que cobram (process-payment e pix), para que o valor mostrado e o
 * valor cobrado saiam da mesma conta.
 *
 * Dois descontos possíveis, e eles NÃO se somam — vale o menor preço:
 *  - "em uso": um cupom que a pessoa já resgatou e que ainda tem mensalidades
 *    com desconto. Vem da FOTO gravada no resgate, não do cupom atual: pausar,
 *    vencer ou editar o cupom não muda nada para quem já usa.
 *  - "novo": o código que ela acabou de digitar.
 *
 * Este cálculo é a PROMESSA mostrada antes de pagar. O direito é conferido de
 * novo na aprovação (processar_pagamento_aprovado), com o perfil travado:
 * dois pagamentos gerados ao mesmo tempo não consomem a mesma mensalidade.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, any, any>;

/** As condições do desconto, como vão gravadas no pagamento. */
export interface FotoDesconto {
  couponId: string;
  code: string;
  tipo: TipoDesconto;
  valor: number;
  /** null = para sempre. */
  duracaoMeses: number | null;
  paraSempre: boolean;
}

export interface DescontoAplicado extends FotoDesconto {
  origem: "cupom_novo" | "cupom_em_uso";
  /** Mensalidades com desconto que restam, contando a que está sendo paga. null = para sempre. */
  restantes: number | null;
  valorFinal: number;
}

export interface PrecoAssinatura {
  base: number;
  valor: number;
  desconto: DescontoAplicado | null;
  /** Código digitado que não pôde ser usado. Quem cobra RECUSA o pagamento. */
  erroCupom?: string;
}

interface LinhaResgate {
  coupon_id: string;
  desconto_tipo: string | null;
  desconto_valor: number | string | null;
  duracao_meses: number | null;
  para_sempre: boolean | null;
  mensalidades_usadas: number | null;
  encerrado_em: string | null;
  coupons: { code: string } | { code: string }[] | null;
}

function codigoDoEmbed(embed: LinhaResgate["coupons"]): string {
  if (!embed) return "";
  return Array.isArray(embed) ? embed[0]?.code ?? "" : embed.code ?? "";
}

/**
 * Descontos que a pessoa já tem e que ainda valem. Função pura: recebe as
 * linhas de coupon_redemptions e devolve os candidatos.
 */
export function descontosEmUso(linhas: LinhaResgate[], base = PRECO_BASE): DescontoAplicado[] {
  const candidatos: DescontoAplicado[] = [];

  for (const r of linhas) {
    if (r.encerrado_em) continue;
    if (!ehTipoDesconto(r.desconto_tipo)) continue;

    const valor = Number(r.desconto_valor);
    if (!Number.isFinite(valor) || valor <= 0) continue;

    const paraSempre = r.para_sempre === true;
    const duracaoMeses = paraSempre ? null : Number(r.duracao_meses) || 1;
    const restantes = mensalidadesRestantes(duracaoMeses, Number(r.mensalidades_usadas) || 0);
    if (restantes !== null && restantes <= 0) continue;

    candidatos.push({
      origem: "cupom_em_uso",
      couponId: r.coupon_id,
      code: codigoDoEmbed(r.coupons),
      tipo: r.desconto_tipo,
      valor,
      duracaoMeses,
      paraSempre,
      restantes,
      valorFinal: aplicarDesconto(base, r.desconto_tipo, valor),
    });
  }

  return candidatos;
}

/** O menor preço vence; no empate, o que a pessoa já usa (não cria resgate novo). */
export function escolherMelhorDesconto(candidatos: DescontoAplicado[]): DescontoAplicado | null {
  let melhor: DescontoAplicado | null = null;
  for (const c of candidatos) {
    if (
      !melhor ||
      c.valorFinal < melhor.valorFinal ||
      (c.valorFinal === melhor.valorFinal && c.origem === "cupom_em_uso" && melhor.origem !== "cupom_em_uso")
    ) {
      melhor = c;
    }
  }
  return melhor;
}

/**
 * estrito: quem vai GRAVAR a partir do resultado (o valor da assinatura no
 * Mercado Pago, a foto de uma cobrança) precisa do erro, não de "sem desconto".
 * Só a prévia da tela aceita cair para o preço cheio numa falha de leitura.
 */
export async function carregarResgatesEmUso(
  adminClient: AdminClient,
  userId: string,
  { estrito = false }: { estrito?: boolean } = {}
): Promise<LinhaResgate[]> {
  const { data, error } = await adminClient
    .from("coupon_redemptions")
    .select(
      "coupon_id, desconto_tipo, desconto_valor, duracao_meses, para_sempre, mensalidades_usadas, encerrado_em, coupons(code)"
    )
    .eq("profile_id", userId)
    .in("desconto_tipo", ["percent", "fixed"]);

  if (error) {
    if (estrito) throw error;
    // Antes da migração 20260923120000 as colunas não existem. Sem a foto não
    // há desconto em uso para aplicar — e errar para o preço cheio aqui é
    // seguro: a tela mostra o mesmo valor que será cobrado.
    console.error("[preco] não foi possível ler os descontos em uso:", error.message);
    return [];
  }

  return (data ?? []) as unknown as LinhaResgate[];
}

export async function calcularPrecoAssinatura({
  adminClient,
  userId,
  codigo,
  base = PRECO_BASE,
  estrito = false,
}: {
  adminClient: AdminClient;
  userId: string;
  codigo?: string | null;
  base?: number;
  /** Falha ao ler os descontos em uso sobe como erro (ver carregarResgatesEmUso). */
  estrito?: boolean;
}): Promise<PrecoAssinatura> {
  const candidatos = descontosEmUso(await carregarResgatesEmUso(adminClient, userId, { estrito }), base);
  let erroCupom: string | undefined;

  const codigoLimpo = codigo ? normalizarCodigo(codigo) : "";
  const jaEmUso = codigoLimpo && candidatos.some((c) => c.code === codigoLimpo);

  // Código de um cupom que a pessoa já usa e ainda vale: não é erro, é o
  // mesmo desconto que já entrou na conta.
  if (codigoLimpo && !jaEmUso) {
    const r = await resolverDescontoDeCupom({ adminClient, code: codigoLimpo, userId, basePrice: base });

    if (!r.valido) {
      erroCupom = r.motivo;
    } else if (!ehTipoDesconto(r.tipo)) {
      // VIP e dias de teste são concedidos em /api/coupons/apply, nunca no
      // pagamento. Aqui eles respondem igual a um código inexistente.
      erroCupom = MENSAGEM_CUPOM_INVALIDO;
    } else {
      candidatos.push({
        origem: "cupom_novo",
        couponId: r.couponId,
        code: r.code,
        tipo: r.tipo,
        valor: r.valor,
        duracaoMeses: r.duracaoMeses,
        paraSempre: r.paraSempre,
        restantes: r.duracaoMeses,
        valorFinal: aplicarDesconto(base, r.tipo, r.valor),
      });
    }
  }

  const desconto = escolherMelhorDesconto(candidatos);

  return {
    base,
    valor: desconto ? desconto.valorFinal : base,
    desconto,
    ...(erroCupom ? { erroCupom } : {}),
  };
}

/**
 * O que pode ir para o navegador: sem couponId (não há motivo para o cliente
 * conhecer ids internos) e com as frases prontas, iguais em todas as telas.
 */
export function precoParaTela(preco: PrecoAssinatura) {
  const d = preco.desconto;
  return {
    base: preco.base,
    valor: preco.valor,
    desconto: d
      ? {
          codigo: d.code,
          origem: d.origem,
          tipo: d.tipo,
          valor: d.valor,
          paraSempre: d.paraSempre,
          restantes: d.restantes,
          descricao: descreverDesconto(d.tipo, d.valor),
          frase: descreverPrecoComDesconto({
            valorFinal: d.valorFinal,
            restantes: d.restantes,
            novo: d.origem === "cupom_novo",
            base: preco.base,
          }),
        }
      : null,
  };
}

export type PrecoParaTela = ReturnType<typeof precoParaTela>;

/** O valor que a tela mostrou bate com o que o servidor vai cobrar? */
export function valorConfere(esperado: unknown, cobrado: number): boolean {
  if (esperado === undefined || esperado === null || esperado === "") return true;
  const n = Number(esperado);
  return Number.isFinite(n) && Math.abs(n - cobrado) < 0.005;
}

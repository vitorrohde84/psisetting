import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { cronAutorizado } from "@/utils/cron-auth";
import { isEmailAdmin } from "@/utils/admin-auth";
import {
  cancelarAssinaturaCartao,
  conferirAssinatura,
  type LinhaAssinatura,
} from "@/utils/assinatura-cartao-servidor";

/**
 * Conferência diária da renovação automática (vercel.json → crons).
 *
 * O webhook é o caminho rápido; este é o que não depende dele. Para cada
 * assinatura viva, pergunta direto ao Mercado Pago:
 *  - faturas aprovadas que não viraram dias (webhook perdido ou recusado);
 *  - cartão recusado na última fatura (a tela avisa);
 *  - assinatura cancelada lá (3 faturas recusadas, ou pelo app do Mercado Pago);
 *  - valor que ainda não subiu para R$ 34,90 depois dos meses do cupom;
 *  - criação que ficou sem resposta clara, e assinatura a mais da mesma pessoa.
 * Também cancela a de quem virou VIP ou admin (a cobrança devia ter parado) e
 * confere as faturas das canceladas há pouco — uma cobrança feita antes do
 * cancelamento ainda pode ser aprovada depois.
 * Tudo é idempotente: rodar duas vezes no dia não muda nada.
 */
export const maxDuration = 60;

// Folga para responder antes de a Vercel cortar a função.
const ORCAMENTO_MS = 50_000;
const CANCELADAS_RECENTES_DIAS = 35;

const COLUNAS =
  "id, user_id, mp_preapproval_id, situacao, mp_status, valor_atual, primeira_cobranca, proxima_cobranca, payer_email, cartao_final, cartao_bandeira, resgate_reservado_id, ultima_recusa_em, cancelada_em, cancelada_por, erro, criada_em, atualizada_em";

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const inicio = Date.now();
  const admin = createAdminClient();

  // As que foram conferidas há mais tempo primeiro: se o orçamento acabar, a
  // próxima rodada continua de onde esta parou.
  const [vivas, canceladas] = await Promise.all([
    admin
      .from("assinaturas_cartao")
      .select(COLUNAS)
      .in("situacao", ["criando", "ativa"])
      .order("atualizada_em", { ascending: true })
      .limit(100),
    admin
      .from("assinaturas_cartao")
      .select(COLUNAS)
      .eq("situacao", "cancelada")
      .not("mp_preapproval_id", "is", null)
      .gte("cancelada_em", new Date(Date.now() - CANCELADAS_RECENTES_DIAS * 24 * 60 * 60 * 1000).toISOString())
      .order("atualizada_em", { ascending: true })
      .limit(100),
  ]);

  if (vivas.error || canceladas.error) {
    console.error("[cron-assinaturas] não foi possível ler as assinaturas:", (vivas.error ?? canceladas.error)?.message);
    return NextResponse.json({ error: "Falha ao ler as assinaturas." }, { status: 500 });
  }

  const linhas = [...(vivas.data ?? []), ...(canceladas.data ?? [])] as LinhaAssinatura[];

  // Quem é VIP ou admin não paga: se ainda tem assinatura viva (o cancelamento
  // falhou quando virou VIP/admin), cancela aqui.
  const ids = [...new Set(linhas.filter((l) => l.situacao !== "cancelada").map((l) => l.user_id))];
  const semCobranca = new Set<string>();
  if (ids.length) {
    const { data: perfis, error: erroPerfis } = await admin
      .from("profiles")
      .select("id, is_vip, is_admin, email")
      .in("id", ids);
    if (erroPerfis) {
      console.error("[cron-assinaturas] perfis não lidos (VIP/admin não conferidos nesta rodada):", erroPerfis.message);
    } else {
      for (const p of perfis ?? []) {
        if (p.is_vip || p.is_admin || isEmailAdmin(p.email)) semCobranca.add(p.id);
      }
    }
  }

  let conferidas = 0;
  let falhas = 0;
  let adiadas = 0;
  let canceladasVip = 0;

  for (const linha of linhas) {
    if (Date.now() - inicio > ORCAMENTO_MS) {
      adiadas = linhas.length - conferidas - falhas;
      console.warn(`[cron-assinaturas] orçamento de tempo esgotado; ${adiadas} ficam para a próxima rodada.`);
      break;
    }
    try {
      if (linha.situacao === "ativa" && semCobranca.has(linha.user_id)) {
        console.error(`[cron-assinaturas] ${linha.user_id} é VIP/admin e ainda tinha renovação ativa; cancelando.`);
        await cancelarAssinaturaCartao(admin, linha, "sistema");
        canceladasVip++;
      } else {
        await conferirAssinatura(admin, linha);
      }
      conferidas++;
    } catch (err) {
      falhas++;
      console.error(`[cron-assinaturas] ${linha.mp_preapproval_id ?? linha.id} (${linha.user_id}) falhou:`, err);
    }
  }

  return NextResponse.json({ conferidas, falhas, adiadas, canceladasVip });
}

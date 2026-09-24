import { NextResponse } from "next/server";
import { requireAdmin } from "@/utils/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { pagamentosDeAssinatura } from "@/utils/assinatura-cartao-servidor";

/**
 * Diagnóstico da renovação automática (só admin): o que o Mercado Pago fez
 * com cada tentativa de assinatura.
 *
 * Existe por causa do CC_VAL_433 ("Credit card validation has failed") de
 * 23/09/2026: a resposta da criação diz só que a cobrança de verificação do
 * cartão falhou. O motivo (status_detail, ex.: cc_rejected_high_risk ou
 * cc_rejected_insufficient_amount) fica no pagamento de verificação, que só
 * aparece na busca de pagamentos. Aqui os dois lados ficam juntos: as
 * verificações e cobranças de assinatura no Mercado Pago e as tentativas
 * gravadas em assinaturas_cartao, no mesmo intervalo.
 *
 * Uso: abrir /api/admin/diagnostico-assinaturas?horas=24 logado como admin.
 */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error || "Não autorizado." }, { status: 403 });
  }

  const horasPedidas = Number(new URL(request.url).searchParams.get("horas"));
  const horas = Number.isFinite(horasPedidas) && horasPedidas >= 1 && horasPedidas <= 168 ? horasPedidas : 24;
  const ate = new Date();
  const desde = new Date(ate.getTime() - horas * 60 * 60 * 1000);

  try {
    const admin = createAdminClient();
    const [mercadoPago, tentativas] = await Promise.all([
      pagamentosDeAssinatura({ desde, ate }),
      admin
        .from("assinaturas_cartao")
        .select("user_id, situacao, mp_status, erro, valor_atual, cartao_bandeira, cartao_final, criada_em")
        .gte("criada_em", desde.toISOString())
        .order("criada_em", { ascending: false })
        .limit(50),
    ]);

    if (tentativas.error) {
      console.error("[diagnostico-assinaturas] tentativas não lidas:", tentativas.error.message);
      return NextResponse.json({ error: "Falha ao ler as tentativas." }, { status: 500 });
    }

    return NextResponse.json({
      intervalo: { desde: desde.toISOString(), ate: ate.toISOString(), horas },
      // status_detail é o motivo: cc_rejected_high_risk = antifraude;
      // cc_rejected_insufficient_amount = limite; cc_rejected_call_for_authorize = banco pede autorização.
      mercado_pago: mercadoPago,
      tentativas: tentativas.data ?? [],
    });
  } catch (err: unknown) {
    console.error("[diagnostico-assinaturas] falhou:", err);
    return NextResponse.json({ error: "Falha ao consultar o Mercado Pago." }, { status: 502 });
  }
}

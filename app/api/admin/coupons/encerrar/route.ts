import { NextResponse } from "next/server";
import { requireAdmin } from "@/utils/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { assinaturaViva, sincronizarAssinatura } from "@/utils/assinatura-cartao-servidor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Encerra o desconto de uma pessoa (resgate_id) ou de todos que usam um cupom
 * (cupom_id). A partir da próxima mensalidade, a pessoa paga o preço cheio.
 *
 * Existe para o caso que pausar não resolve: pausar não tira o desconto de
 * quem já usa (é o combinado), então um cupom "100% para sempre" que vazasse
 * num grupo de WhatsApp ficaria valendo para todos que entraram até a pausa.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error || "Não autorizado." }, { status: 403 });
    }

    const body = await request.json();
    const resgateId = typeof body?.resgate_id === "string" ? body.resgate_id : null;
    const cupomId = typeof body?.cupom_id === "string" ? body.cupom_id : null;

    if ((!resgateId && !cupomId) || (resgateId && !UUID.test(resgateId)) || (cupomId && !UUID.test(cupomId))) {
      return NextResponse.json({ error: "Informe resgate_id ou cupom_id." }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Só os descontos que ainda valem. Quem já usou todas as mensalidades não
    // tem o que encerrar — marcar essas linhas inflaria a contagem e faria o
    // painel mostrar "encerrado" em quem simplesmente terminou.
    let busca = adminClient
      .from("coupon_redemptions")
      .select("id, profile_id, para_sempre, duracao_meses, mensalidades_usadas")
      .is("encerrado_em", null)
      .in("desconto_tipo", ["percent", "fixed"]);

    busca = resgateId ? busca.eq("id", resgateId) : busca.eq("coupon_id", cupomId as string);

    const { data: candidatos, error: buscaError } = await busca;

    if (buscaError) {
      console.error("Erro ao buscar descontos para encerrar:", buscaError);
      return NextResponse.json({ error: "Erro ao encerrar o desconto." }, { status: 500 });
    }

    const vigentes = (candidatos ?? []).filter(
      (r) => r.para_sempre === true || (Number(r.mensalidades_usadas) || 0) < (Number(r.duracao_meses) || 1)
    );
    const ids = vigentes.map((r) => r.id);

    if (ids.length === 0) {
      return NextResponse.json({ success: true, encerrados: 0 });
    }

    const { error } = await adminClient
      .from("coupon_redemptions")
      .update({ encerrado_em: new Date().toISOString() })
      .in("id", ids);

    if (error) {
      console.error("Erro ao encerrar desconto:", error);
      return NextResponse.json({ error: "Erro ao encerrar o desconto." }, { status: 500 });
    }

    // Quem está na renovação automática: o valor no Mercado Pago volta para o
    // preço cheio já, e não só na conferência diária — senão a cobrança
    // seguinte ainda podia sair com desconto.
    let renovacoesAjustadas = 0;
    for (const perfilId of new Set(vigentes.map((r) => String(r.profile_id)))) {
      try {
        const linha = await assinaturaViva(adminClient, perfilId);
        if (linha?.situacao === "ativa") {
          await sincronizarAssinatura(adminClient, linha);
          renovacoesAjustadas++;
        }
      } catch (err) {
        console.error(`[encerrar-desconto] renovação automática de ${perfilId} não ajustada (a conferência diária refaz):`, err);
      }
    }

    return NextResponse.json({ success: true, encerrados: ids.length, renovacoes_ajustadas: renovacoesAjustadas });
  } catch (err: unknown) {
    console.error("Erro ao encerrar desconto:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

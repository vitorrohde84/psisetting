import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { calcularPrecoAssinatura, precoParaTela } from "@/utils/preco-assinatura";

/**
 * Preço que o psicólogo logado paga hoje, com o desconto que ele já usa.
 *
 * Chamado ao abrir o modal de assinatura, para que quem tem cupom "por 3 meses"
 * ou "para sempre" veja o valor certo sem digitar o código de novo.
 * Não aceita código de cupom de propósito: validar código é trabalho de
 * /api/coupons/apply, que tem limite de tentativas.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
    }

    const preco = await calcularPrecoAssinatura({
      adminClient: createAdminClient(),
      userId: user.id,
    });

    return NextResponse.json(precoParaTela(preco));
  } catch (error: unknown) {
    console.error("[preco] erro ao calcular:", error);
    return NextResponse.json({ error: "Erro ao calcular o preço." }, { status: 500 });
  }
}

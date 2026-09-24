import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { checkRateLimit } from "@/utils/rate-limit";
import { assinaturaViva, cancelarAssinaturaCartao } from "@/utils/assinatura-cartao-servidor";

/**
 * "Cancelar renovação automática" (Configurações → Plano & Assinatura).
 *
 * Cancela a assinatura no Mercado Pago — não tem volta lá; para voltar, a
 * pessoa assina de novo. O acesso segue pelas datas até o fim do período já
 * pago, sem a tolerância de cartão recusado.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
  }

  try {
    const rate = await checkRateLimit(`cancelar-renovacao:${user.id}`, 5, 10 * 60 * 1000);
    if (!rate.success) {
      return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
    }

    const admin = createAdminClient();
    const linha = await assinaturaViva(admin, user.id);
    if (!linha) {
      return NextResponse.json({ error: "Não há renovação automática ligada nesta conta." }, { status: 404 });
    }
    if (linha.situacao === "criando") {
      return NextResponse.json(
        { error: "A renovação automática ainda está sendo confirmada pelo Mercado Pago. Tente de novo em alguns minutos." },
        { status: 409 }
      );
    }

    await cancelarAssinaturaCartao(admin, linha, "usuario");

    const { data: perfil, error: erroPerfil } = await supabase
      .from("profiles")
      .select("current_period_end")
      .eq("id", user.id)
      .single();
    if (erroPerfil) console.error("[cancelar-renovacao] perfil não lido depois de cancelar:", erroPerfil.message);

    return NextResponse.json({ ok: true, acesso_ate: perfil?.current_period_end ?? null });
  } catch (error: unknown) {
    console.error("[cancelar-renovacao] falhou:", error);
    return NextResponse.json(
      // Pode ter cancelado no Mercado Pago e falhado só ao gravar aqui: a
      // conferência diária acerta. Por isso "confira", e não "nada mudou".
      { error: "Não foi possível confirmar o cancelamento agora. Confira em alguns minutos; se continuar ligada, tente de novo." },
      { status: 500 }
    );
  }
}

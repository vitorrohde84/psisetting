import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { preApprovalClient } from "@/utils/mercadopago";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    // Obter perfil do usuário
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome, email, is_vip, subscription_status")
      .eq("id", user.id)
      .single();

    if (profile?.is_vip) {
      return NextResponse.json({
        message: "Esta conta possui acesso VIP gratuito vitalício.",
        is_vip: true,
      });
    }

    const host = request.headers.get("host") || "app.psisetting.com.br";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    // Criar assinatura recorrente no Mercado Pago (R$ 29,90/mês)
    const subscription = await preApprovalClient.create({
      body: {
        reason: "PsiSetting — Gestão Clínica (Plano Mensal)",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: 29.9,
          currency_id: "BRL",
        },
        back_url: `${baseUrl}/configuracoes?status=assinatura_sucesso`,
        payer_email: user.email || profile?.email || "contato@psisetting.com.br",
        external_reference: user.id,
        status: "authorized",
      },
    });

    if (!subscription.init_point) {
      throw new Error("Não foi possível gerar o link de pagamento do Mercado Pago.");
    }

    return NextResponse.json({
      init_point: subscription.init_point,
      id: subscription.id,
    });
  } catch (error: any) {
    console.error("Erro ao criar assinatura no Mercado Pago:", error);
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Erro ao processar assinatura com o Mercado Pago. Verifique suas credenciais.",
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { preApprovalClient, preferenceClient } from "@/utils/mercadopago";

export async function POST(request: Request) {
  try {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        {
          error:
            "Credenciais do Mercado Pago não configuradas. Adicione a variável MERCADO_PAGO_ACCESS_TOKEN nas configurações de ambiente da Vercel.",
        },
        { status: 500 }
      );
    }

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

    let initPoint = "";
    let subId = "";

    // 1. Tentar criar assinatura recorrente (PreApproval)
    try {
      const subscription = await preApprovalClient.create({
        body: {
          reason: "PsiSetting — Gestão Clínica (Plano Mensal)",
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: 34.9,
            currency_id: "BRL",
          },
          back_url: `${baseUrl}/configuracoes?status=assinatura_sucesso`,
          payer_email: user.email || profile?.email || "contato@psisetting.com.br",
          external_reference: user.id,
          status: "authorized",
        },
      });
      initPoint = subscription.init_point || "";
      subId = subscription.id || "";
    } catch (preApprovalError: any) {
      console.warn("PreApproval falhou, tentando fallback com Preference:", preApprovalError?.message);

      // 2. Fallback: Criar Checkout Pro Preference (aceita Cartão, Pix e Boleto)
      const preference = await preferenceClient.create({
        body: {
          items: [
            {
              id: "plano-mensal",
              title: "PsiSetting — Plano Profissional (Mensal)",
              description: "Assinatura mensal de gestão clínica",
              quantity: 1,
              unit_price: 34.9,
              currency_id: "BRL",
            },
          ],
          payer: {
            email: user.email || profile?.email || undefined,
            name: profile?.nome || undefined,
          },
          external_reference: user.id,
          statement_descriptor: "PSISETTING",
          back_urls: {
            success: `${baseUrl}/configuracoes?status=assinatura_sucesso`,
            pending: `${baseUrl}/configuracoes?status=assinatura_pendente`,
            failure: `${baseUrl}/configuracoes?status=assinatura_falha`,
          },
          auto_return: "approved",
        },
      });

      initPoint = preference.init_point || preference.sandbox_init_point || "";
      subId = preference.id || "";
    }

    if (!initPoint) {
      throw new Error("Não foi possível gerar o link de pagamento do Mercado Pago.");
    }

    return NextResponse.json({
      init_point: initPoint,
      id: subId,
    });
  } catch (error: any) {
    console.error("Erro ao processar checkout no Mercado Pago:", error);
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Erro ao processar assinatura com o Mercado Pago. Verifique se as credenciais foram adicionadas na Vercel.",
      },
      { status: 500 }
    );
  }
}

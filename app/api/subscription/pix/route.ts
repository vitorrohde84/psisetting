import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { paymentClient } from "@/utils/mercadopago";

export async function POST(request: Request) {
  try {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        {
          error:
            "Credenciais do Mercado Pago não configuradas. Adicione MERCADO_PAGO_ACCESS_TOKEN nas variáveis de ambiente.",
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

    // Obter perfil do psicólogo
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome, email, is_vip")
      .eq("id", user.id)
      .single();

    if (profile?.is_vip) {
      return NextResponse.json({
        message: "Esta conta possui acesso VIP vitalício.",
        is_vip: true,
      });
    }

    const host = request.headers.get("host") || "app.psisetting.com.br";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    // Gerar pagamento Pix instantâneo via Mercado Pago API
    const payment = await paymentClient.create({
      body: {
        transaction_amount: 29.9,
        description: "PsiSetting — Assinatura Mensal de Gestão Clínica",
        payment_method_id: "pix",
        payer: {
          email: user.email || profile?.email || "contato@psisetting.com.br",
          first_name: (profile?.nome || user.email?.split("@")[0] || "Psicólogo").split(" ")[0],
          last_name: (profile?.nome || "").split(" ").slice(1).join(" ") || "Clínica",
        },
        external_reference: user.id,
        notification_url: `${baseUrl}/api/webhooks/mercadopago`,
      },
    });

    const pointOfInteraction = payment.point_of_interaction;
    const transactionData = pointOfInteraction?.transaction_data;

    const qrCode = transactionData?.qr_code;
    const qrCodeBase64 = transactionData?.qr_code_base64;
    const ticketUrl = transactionData?.ticket_url;

    if (!qrCode && !qrCodeBase64) {
      throw new Error("Não foi possível gerar a chave Pix no Mercado Pago.");
    }

    return NextResponse.json({
      payment_id: payment.id,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      ticket_url: ticketUrl,
      amount: 29.9,
      status: payment.status,
      date_of_expiration: payment.date_of_expiration,
    });
  } catch (error: any) {
    console.error("Erro ao gerar Pix no Mercado Pago:", error);
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Erro ao gerar cobrança Pix. Verifique suas chaves do Mercado Pago.",
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { paymentClient } from "@/utils/mercadopago";

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

    const body = await request.json();
    const { formData } = body;

    if (!formData) {
      return NextResponse.json(
        { error: "Dados do formulário de pagamento não fornecidos." },
        { status: 400 }
      );
    }

    const host = request.headers.get("host") || "app.psisetting.com.br";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    // Processar o pagamento diretamente com o token do cartão ou Pix gerado pelo Brick
    const payment = await paymentClient.create({
      body: {
        ...formData,
        transaction_amount: Number(formData.transaction_amount) || 29.9,
        description: "PsiSetting — Plano Profissional (Mensal)",
        external_reference: user.id,
        notification_url: `${baseUrl}/api/webhooks/mercadopago`,
      },
    });

    if (payment.status === "approved") {
      const newPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await supabase
        .from("profiles")
        .update({
          subscription_status: "active",
          current_period_end: newPeriodEnd.toISOString(),
          trial_ends_at: newPeriodEnd.toISOString(),
        })
        .eq("id", user.id);
    }

    return NextResponse.json({
      status: payment.status,
      status_detail: payment.status_detail,
      id: payment.id,
    });
  } catch (error: any) {
    console.error("Erro ao processar pagamento via Brick:", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao processar pagamento." },
      { status: 500 }
    );
  }
}

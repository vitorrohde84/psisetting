import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { paymentClient } from "@/utils/mercadopago";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const paymentId = url.searchParams.get("payment_id");

    if (!paymentId) {
      return NextResponse.json(
        { error: "payment_id não informado." },
        { status: 400 }
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

    // Consultar status do pagamento no Mercado Pago
    const payment = await paymentClient.get({ id: paymentId });

    if (!payment) {
      return NextResponse.json(
        { error: "Pagamento não encontrado." },
        { status: 404 }
      );
    }

    const isApproved = payment.status === "approved";

    if (isApproved) {
      // Ativar plano do psicólogo por 30 dias
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
      approved: isApproved,
      status_detail: payment.status_detail,
    });
  } catch (error: any) {
    console.error("Erro ao verificar status do Pix:", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao verificar status do pagamento." },
      { status: 500 }
    );
  }
}

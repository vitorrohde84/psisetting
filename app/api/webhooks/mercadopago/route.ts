import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { preApprovalClient, paymentClient } from "@/utils/mercadopago";

// Usamos o client com service_role para atualizar o status do perfil com segurança no webhook
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    // O Mercado Pago envia dados tanto por query params (type, data.id) quanto no body JSON
    let topic = searchParams.get("type") || searchParams.get("topic");
    let resourceId = searchParams.get("data.id") || searchParams.get("id");

    let bodyData: any = {};
    try {
      bodyData = await request.json();
      if (!topic && bodyData.type) topic = bodyData.type;
      if (!resourceId && bodyData.data?.id) resourceId = bodyData.data.id;
    } catch {
      // Body vazio ou não JSON é normal em alguns pings de teste
    }

    if (!resourceId) {
      // Retorna 200 para pings de verificação de webhook do Mercado Pago
      return NextResponse.json({ received: true });
    }

    // 1. Processar Assinatura Recorrente (Preapproval)
    if (topic === "subscription_preapproval" || topic === "preapproval") {
      const sub = await preApprovalClient.get({ id: resourceId });

      if (sub && sub.external_reference) {
        const userId = sub.external_reference;
        const mpStatus = sub.status; // 'authorized', 'paused', 'cancelled', 'pending'

        let newStatus = "trialing";
        if (mpStatus === "authorized") {
          newStatus = "active";
        } else if (mpStatus === "cancelled") {
          newStatus = "canceled";
        } else if (mpStatus === "paused") {
          newStatus = "past_due";
        }

        await supabaseAdmin
          .from("profiles")
          .update({
            subscription_status: newStatus,
            mp_subscription_id: sub.id,
            mp_customer_id: sub.payer_id?.toString() || null,
          })
          .eq("id", userId);
      }
    }

    // 2. Processar Pagamento Individual / Cobrança de Assinatura
    if (topic === "payment") {
      const payment = await paymentClient.get({ id: resourceId });

      if (payment && payment.external_reference) {
        const userId = payment.external_reference;
        const paymentStatus = payment.status; // 'approved', 'rejected', 'refunded', 'charged_back'

        if (paymentStatus === "approved") {
          await supabaseAdmin
            .from("profiles")
            .update({
              subscription_status: "active",
            })
            .eq("id", userId);
        } else if (
          paymentStatus === "rejected" ||
          paymentStatus === "refunded" ||
          paymentStatus === "charged_back"
        ) {
          await supabaseAdmin
            .from("profiles")
            .update({
              subscription_status: "past_due",
            })
            .eq("id", userId);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erro no webhook do Mercado Pago:", error);
    // Sempre retornar 200 para evitar que o Mercado Pago faça retentativas desnecessárias se for erro de payload
    return NextResponse.json({ error: error?.message, received: true });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { paymentClient } from "@/utils/mercadopago";

const BASE_PRICE = 34.9;

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
    const { formData, coupon_code } = body;

    if (!formData) {
      return NextResponse.json(
        { error: "Dados do formulário de pagamento não fornecidos." },
        { status: 400 }
      );
    }

    // Calcular valor final com cupom (se fornecido)
    let finalAmount = Number(formData.transaction_amount) || BASE_PRICE;

    if (coupon_code) {
      const cleanCode = String(coupon_code).trim().toUpperCase();
      const { data: coupon } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", cleanCode)
        .eq("active", true)
        .single();

      if (coupon) {
        const discountType = coupon.discount_type || "trial_days";
        const discountVal = Number(coupon.discount_value) || 0;

        if (discountType === "percent" && discountVal > 0) {
          const discount = (BASE_PRICE * discountVal) / 100;
          finalAmount = Math.max(1, BASE_PRICE - discount);
        } else if (discountType === "fixed" && discountVal > 0) {
          finalAmount = Math.max(1, BASE_PRICE - discountVal);
        }
      }
    }

    finalAmount = Number(finalAmount.toFixed(2));

    const host = request.headers.get("host") || "app.psisetting.com.br";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    // Processar o pagamento diretamente com o token do cartão ou Pix gerado pelo Brick
    const payment = await paymentClient.create({
      body: {
        ...formData,
        transaction_amount: finalAmount,
        description: `PsiSetting — Assinatura Mensal (${coupon_code ? `Cupom ${coupon_code}` : "Plano Único"})`,
        statement_descriptor: "PSISETTING",
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

      // Se utilizou cupom, registrar resgate
      if (coupon_code) {
        const cleanCode = String(coupon_code).trim().toUpperCase();
        const { data: coupon } = await supabase
          .from("coupons")
          .select("id, uses_count")
          .eq("code", cleanCode)
          .single();

        if (coupon) {
          await supabase.from("coupon_redemptions").insert({
            coupon_id: coupon.id,
            profile_id: user.id,
          });
          await supabase
            .from("coupons")
            .update({ uses_count: (coupon.uses_count || 0) + 1 })
            .eq("id", coupon.id);
        }
      }
    }

    return NextResponse.json({
      status: payment.status,
      status_detail: payment.status_detail,
      id: payment.id,
      amount: finalAmount,
    });
  } catch (error: any) {
    console.error("Erro ao processar pagamento:", error);
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Erro ao processar o pagamento com o Mercado Pago. Verifique os dados do cartão.",
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { paymentClient } from "@/utils/mercadopago";
import { checkRateLimit } from "@/utils/rate-limit";
import { ativarAssinatura } from "@/utils/subscription-activation";
import { resolverDescontoDeCupom, registrarResgate } from "@/utils/coupons";

const BASE_PRICE = 34.9;

/**
 * Processa o pagamento do Brick (cartão ou PIX) e ativa a assinatura.
 *
 * A05 — docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
 *
 * A versão anterior fazia:
 *     let finalAmount = Number(formData.transaction_amount) || BASE_PRICE;
 * com formData vindo cru do corpo da requisição, e depois espalhava
 * `...formData` inteiro no pagamento. Ou seja: o cliente definia quanto ia
 * pagar. R$ 0,01 caía em `approved` e liberava 30 dias de assinatura.
 *
 * Agora o preço é calculado exclusivamente no servidor, e do corpo da
 * requisição só passam adiante os campos que o Mercado Pago precisa para
 * identificar o meio de pagamento — nunca valor, referência ou URL.
 */
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

    const rate = await checkRateLimit(`pagamento:${user.id}`, 10, 10 * 60 * 1000);
    if (!rate.success) {
      return NextResponse.json(
        { error: "Muitas tentativas de pagamento. Aguarde alguns minutos." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { formData, coupon_code } = body ?? {};

    if (!formData || typeof formData !== "object") {
      return NextResponse.json(
        { error: "Dados do formulário de pagamento não fornecidos." },
        { status: 400 }
      );
    }

    // ── Preço: decidido aqui, ponto ──────────────────────────────────────
    const adminClient = createAdminClient();
    let finalAmount = BASE_PRICE;
    let cupomAplicado: { id: string; code: string } | null = null;

    if (coupon_code) {
      // A leitura do cupom passa por service_role: o catálogo deixou de ser
      // legível pelo usuário (A11), justamente para não ser enumerável.
      const desconto = await resolverDescontoDeCupom({
        adminClient,
        code: String(coupon_code),
        userId: user.id,
        basePrice: BASE_PRICE,
      });

      if (desconto.valido) {
        finalAmount = desconto.valorFinal;
        cupomAplicado = { id: desconto.couponId, code: desconto.code };
      }
    }

    finalAmount = Number(finalAmount.toFixed(2));

    // ── Campos aceitos do cliente: apenas identificação do meio de pagamento.
    // Espalhar `...formData` deixava o cliente sobrescrever transaction_amount,
    // external_reference e notification_url.
    const {
      token,
      payment_method_id,
      issuer_id,
      installments,
      payer,
    } = formData as Record<string, unknown>;

    if (!payment_method_id) {
      return NextResponse.json(
        { error: "Meio de pagamento não informado." },
        { status: 400 }
      );
    }

    const host = request.headers.get("host") || "app.psisetting.com.br";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    const payment = await paymentClient.create({
      body: {
        token: token as string | undefined,
        payment_method_id: payment_method_id as string,
        issuer_id: issuer_id as string | undefined,
        installments: Number(installments) || 1,
        payer: payer as Record<string, unknown> | undefined,
        transaction_amount: finalAmount,
        description: `PsiSetting — Assinatura Mensal (${cupomAplicado ? `Cupom ${cupomAplicado.code}` : "Plano Único"})`,
        statement_descriptor: "PSISETTING",
        external_reference: user.id,
        notification_url: `${baseUrl}/api/webhooks/mercadopago`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });

    if (payment.status === "approved") {
      await ativarAssinatura({
        adminClient,
        userId: user.id,
        paymentId: String(payment.id),
        origem: "process-payment",
      });

      if (cupomAplicado) {
        await registrarResgate({
          adminClient,
          couponId: cupomAplicado.id,
          userId: user.id,
        });
      }
    }

    return NextResponse.json({
      status: payment.status,
      status_detail: payment.status_detail,
      id: payment.id,
      amount: finalAmount,
    });
  } catch (error: unknown) {
    console.error("Erro ao processar pagamento:", error);
    // A mensagem crua do Mercado Pago pode carregar detalhe interno; o
    // usuário recebe uma resposta estável e o detalhe fica no log.
    return NextResponse.json(
      {
        error:
          "Erro ao processar o pagamento. Verifique os dados informados e tente novamente.",
      },
      { status: 500 }
    );
  }
}

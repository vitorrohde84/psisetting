import { NextResponse, after } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { criarPagamento } from "@/utils/mercadopago";
import { checkRateLimit, getClientIp } from "@/utils/rate-limit";
import { calcularPrecoAssinatura, precoParaTela, valorConfere } from "@/utils/preco-assinatura";
import { metadataDoDesconto } from "@/utils/pagamento-aprovado";
import { expiracaoPixMercadoPago, fimDaValidadePix, segundosRestantesPix } from "@/utils/pix-validade";
import { cancelarOutrosPixPendentes } from "@/utils/pix-cancelamento";
import { assinaturaViva } from "@/utils/assinatura-cartao-servidor";

/**
 * Gera o PIX de 30 dias de acesso.
 *
 * Antes, o cupom era lido com o client do USUÁRIO — que desde a correção A11
 * não enxerga a tabela de cupons. O desconto era ignorado em silêncio: o botão
 * mostrava "R$ 27,92" e o QR saía de R$ 34,90. O preço agora vem do mesmo
 * cálculo das outras telas, no servidor.
 */
// O SDK tenta de novo em 429/5xx (até ~45 s no pior caso): folga para não
// cortar a função no meio da criação do PIX.
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
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

    const rate = await checkRateLimit(`pix:${user.id}`, 10, 10 * 60 * 1000);
    if (!rate.success) {
      return NextResponse.json(
        { error: "Muitas tentativas de gerar PIX. Aguarde alguns minutos." },
        { status: 429 }
      );
    }

    let couponCode: string | null = null;
    let valorEsperado: unknown;
    try {
      const body = await request.json();
      if (body?.coupon_code) couponCode = String(body.coupon_code).trim().toUpperCase();
      valorEsperado = body?.valor_esperado;
    } catch {
      // Sem corpo: preço sem código digitado.
    }

    // Código digitado conta nas tentativas de cupom, como em /api/coupons/apply:
    // sem isto, esta rota viraria um jeito ilimitado de testar códigos.
    if (couponCode) {
      const [porConta, porIp] = await Promise.all([
        checkRateLimit(`coupon:u:${user.id}`, 8, 5 * 60 * 1000),
        checkRateLimit(`coupon:${getClientIp(request)}`, 8, 5 * 60 * 1000),
      ]);
      if (!porConta.success || !porIp.success) {
        return NextResponse.json(
          { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
          { status: 429 }
        );
      }
    }

    const { data: profile, error: erroPerfil } = await supabase
      .from("profiles")
      .select("nome, email, is_vip")
      .eq("id", user.id)
      .single();
    if (erroPerfil) {
      // Sem o perfil o PIX ainda sai (nome e e-mail têm alternativa), mas quem
      // é VIP não pode ser cobrado por engano: sem saber, não cobra.
      console.error("[pix] perfil não lido:", erroPerfil.message);
      return NextResponse.json({ error: "Não foi possível ler sua conta. Tente de novo em instantes." }, { status: 500 });
    }

    if (profile?.is_vip) {
      return NextResponse.json({
        message: "Esta conta possui acesso VIP vitalício.",
        is_vip: true,
      });
    }

    // Renovação automática ligada: a cobrança do mês é dela. Um pagamento avulso
    // agora seria cobrar a pessoa duas vezes no mesmo mês.
    if (await assinaturaViva(createAdminClient(), user.id)) {
      return NextResponse.json(
        {
          error: "Sua renovação automática no cartão está ligada. Veja a próxima cobrança em Configurações → Plano & Assinatura.",
          renovacao: true,
        },
        { status: 409 }
      );
    }

    const preco = await calcularPrecoAssinatura({
      adminClient: createAdminClient(),
      userId: user.id,
      codigo: couponCode,
    });

    // Código que não vale mais: recusa, em vez de cobrar o preço cheio de quem
    // esperava pagar com desconto.
    if (preco.erroCupom) {
      return NextResponse.json({ error: preco.erroCupom }, { status: 400 });
    }

    // A tela mostrou um valor e o servidor chegou a outro (o desconto acabou
    // em outra aba, por exemplo). Não cobra: devolve o preço novo para a tela.
    if (!valorConfere(valorEsperado, preco.valor)) {
      return NextResponse.json(
        {
          error: "O valor mudou desde que a tela foi aberta. Confira o novo valor e gere o PIX de novo.",
          preco: precoParaTela(preco),
        },
        { status: 409 }
      );
    }

    const host = request.headers.get("host") || "app.psisetting.com.br";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;
    const d = preco.desconto;

    // Cliente novo e chave própria por PIX: ver utils/mercadopago.ts.
    const payment = await criarPagamento(
      {
        transaction_amount: preco.valor,
        description: `PsiSetting — 30 dias de acesso (${d ? `Cupom ${d.code}` : "Plano Único"})`,
        payment_method_id: "pix",
        // 32 min no Mercado Pago (o mínimo que ele aceita); os 15 min que a
        // pessoa vê são garantidos pelo cancelamento — ver utils/pix-validade.ts.
        date_of_expiration: expiracaoPixMercadoPago(),
        payer: {
          email: user.email || profile?.email || "contato@psisetting.com.br",
          first_name: (profile?.nome || user.email?.split("@")[0] || "Psicólogo").split(" ")[0],
          last_name: (profile?.nome || "").split(" ").slice(1).join(" ") || "Clínica",
        },
        external_reference: user.id,
        notification_url: `${baseUrl}/api/webhooks/mercadopago`,
        metadata: metadataDoDesconto(d),
      }
    );

    const transactionData = payment.point_of_interaction?.transaction_data;
    const qrCode = transactionData?.qr_code;
    const qrCodeBase64 = transactionData?.qr_code_base64;

    if (!qrCode && !qrCodeBase64) {
      throw new Error("Não foi possível gerar a chave Pix no Mercado Pago.");
    }

    // Um QR válido por pessoa. Depois da resposta, para não atrasar o QR novo;
    // falhar aqui só deixa o anterior vencer sozinho no Mercado Pago.
    const novoId = String(payment.id);
    after(() =>
      cancelarOutrosPixPendentes({ userId: user.id, exceto: novoId }).catch((err) =>
        console.error("[pix] falha ao cancelar os PIX anteriores:", err)
      )
    );

    return NextResponse.json({
      payment_id: payment.id,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      ticket_url: transactionData?.ticket_url,
      amount: preco.valor,
      status: payment.status,
      // A tela conta a partir da DURAÇÃO, no relógio dela (ver segundosRestantesPix).
      validade_segundos: segundosRestantesPix(payment.date_created),
      date_of_expiration: fimDaValidadePix(payment.date_created).toISOString(),
    });
  } catch (error: unknown) {
    console.error("Erro ao gerar Pix no Mercado Pago:", error);
    // A mensagem crua do Mercado Pago pode carregar detalhe interno.
    return NextResponse.json(
      { error: "Erro ao comunicar com o Mercado Pago para gerar o Pix. Tente novamente em instantes." },
      { status: 500 }
    );
  }
}

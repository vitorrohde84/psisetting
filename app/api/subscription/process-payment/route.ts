import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { criarPagamento } from "@/utils/mercadopago";
import { checkRateLimit, getClientIp } from "@/utils/rate-limit";
import { calcularPrecoAssinatura, precoParaTela, valorConfere } from "@/utils/preco-assinatura";
import { metadataDoDesconto, processarPagamentoAprovado } from "@/utils/pagamento-aprovado";

/**
 * Processa o pagamento do Brick (cartão) e ativa 30 dias de acesso.
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
 *
 * Depois que o Mercado Pago cobrou, esta rota NUNCA responde erro: um 500 ali
 * aparecia como "pagamento não aprovado", a pessoa tentava de novo e era
 * cobrada duas vezes. Se registrar os dias falhar, a reconciliação e o webhook
 * terminam o trabalho.
 */
// O SDK tenta de novo em 429/5xx (até ~45 s no pior caso). Sem folga, a função
// seria cortada no meio de uma cobrança já enviada.
export const maxDuration = 60;

export async function POST(request: Request) {
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

  let payment: Awaited<ReturnType<typeof criarPagamento>>;
  let valorCobrado: number;
  // A partir daqui o pedido pode ter chegado ao Mercado Pago: um erro de
  // conexão não diz se a cobrança aconteceu ou não.
  let enviado = false;

  try {
    const rate = await checkRateLimit(`pagamento:${user.id}`, 10, 10 * 60 * 1000);
    if (!rate.success) {
      return NextResponse.json(
        { error: "Muitas tentativas de pagamento. Aguarde alguns minutos." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { formData, coupon_code, valor_esperado } = body ?? {};

    if (!formData || typeof formData !== "object") {
      return NextResponse.json(
        { error: "Dados do formulário de pagamento não fornecidos." },
        { status: 400 }
      );
    }

    if (coupon_code) {
      // Mesmos contadores de /api/coupons/apply (por conta E por IP): testar
      // códigos por aqui também conta, e várias contas no mesmo IP não somam.
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

    // ── Preço: decidido aqui, ponto ──────────────────────────────────────
    const preco = await calcularPrecoAssinatura({
      adminClient: createAdminClient(),
      userId: user.id,
      codigo: coupon_code ? String(coupon_code) : null,
    });

    if (preco.erroCupom) {
      return NextResponse.json({ error: preco.erroCupom }, { status: 400 });
    }

    if (!valorConfere(valor_esperado, preco.valor)) {
      return NextResponse.json(
        {
          error: "O valor mudou desde que a tela foi aberta. Confira o novo valor antes de pagar.",
          preco: precoParaTela(preco),
        },
        { status: 409 }
      );
    }

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
    const d = preco.desconto;
    valorCobrado = preco.valor;

    // O SDK gera uma chave de idempotência aleatória por chamada: um reenvio
    // da mesma requisição (rede instável, clique duplo) virava outra cobrança.
    // Com a chave presa ao token do cartão, o Mercado Pago devolve o mesmo
    // pagamento. criarPagamento usa um cliente novo por chamada — ver o
    // porquê em utils/mercadopago.ts.
    const chave = token
      ? createHash("sha256").update(`${user.id}:${String(token)}`).digest("hex")
      : undefined;

    enviado = true;
    payment = await criarPagamento(
      {
        token: token as string | undefined,
        payment_method_id: payment_method_id as string,
        issuer_id: issuer_id as string | undefined,
        installments: Number(installments) || 1,
        payer: payer as Record<string, unknown> | undefined,
        transaction_amount: preco.valor,
        description: `PsiSetting — 30 dias de acesso (${d ? `Cupom ${d.code}` : "Plano Único"})`,
        statement_descriptor: "PSISETTING",
        external_reference: user.id,
        notification_url: `${baseUrl}/api/webhooks/mercadopago`,
        metadata: metadataDoDesconto(d),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      chave
    );
  } catch (error: unknown) {
    console.error("Erro ao processar pagamento:", error);
    // Falha AMBÍGUA (rede, tempo esgotado, 5xx) depois de enviar: a cobrança
    // pode ter acontecido. Responder "verifique os dados" convidava a pagar de
    // novo — cobrança em dobro. A tela passa a esperar a confirmação (a
    // reconciliação e o webhook liberam o acesso se foi aprovado).
    const status = (error as { status?: number } | null)?.status;
    if (enviado && (status === undefined || status >= 500 || status === 429)) {
      return NextResponse.json(
        {
          incerto: true,
          error:
            "Não conseguimos confirmar o pagamento com o Mercado Pago agora. Não pague de novo: aguarde alguns minutos — se ele foi aprovado, seu acesso é liberado automaticamente.",
        },
        { status: 202 }
      );
    }
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

  // ── Daqui para baixo o Mercado Pago já decidiu. Nada aqui vira erro. ─────
  // A posse é conferida mesmo aqui: o pagamento devolvido tem que ser o que
  // esta requisição criou para esta pessoa — nunca creditar o de outra.
  let dias: number | undefined;
  let observacao: string | null | undefined;

  if (payment.status === "approved" && payment.external_reference === user.id) {
    try {
      ({ dias, observacao } = await processarPagamentoAprovado({
        adminClient: createAdminClient(),
        userId: user.id,
        payment,
        origem: "process-payment",
      }));
    } catch (err) {
      console.error(
        `[process-payment] pagamento ${payment.id} APROVADO mas não registrado — a reconciliação vai registrar:`,
        err
      );
    }
  }

  return NextResponse.json({
    status: payment.status,
    status_detail: payment.status_detail,
    id: payment.id,
    amount: valorCobrado,
    // Dias realmente concedidos: menos de 30 quando o desconto não coube na
    // aprovação (cupom esgotado ou pausado nesse meio-tempo). A tela mostra o
    // número real em vez de prometer 30.
    dias,
    observacao,
  });
}

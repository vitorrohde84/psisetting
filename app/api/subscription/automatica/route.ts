import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { checkRateLimit, getClientIp } from "@/utils/rate-limit";
import { isEmailAdmin } from "@/utils/admin-auth";
import { calcularPrecoAssinatura, precoParaTela, valorConfere } from "@/utils/preco-assinatura";
import { emailDoPagador, quatroUltimos } from "@/utils/assinatura-cartao";
import { assinaturaViva, criarAssinaturaCartao } from "@/utils/assinatura-cartao-servidor";

/**
 * Liga a renovação automática no cartão: cria a assinatura (preapproval) no
 * Mercado Pago com o cartão tokenizado pelo formulário.
 *
 * Mesmas regras de preço de process-payment: o valor é calculado aqui e a
 * tela manda o que mostrou (valor_esperado → 409 se mudou). Do formulário só
 * passam o token, o e-mail do pagador e o final do cartão.
 *
 * Nada é cobrado nesta requisição. Sem dias pagos nem teste, o Mercado Pago
 * cobra a primeira mensalidade em seguida (até ~1 hora); com dias, no fim
 * deles. Os dias de acesso vêm de cada cobrança aprovada, pelo webhook e pela
 * conferência diária — nunca desta rota.
 */
// A criação no Mercado Pago tem até 25 s, sem novas tentativas.
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
  }

  try {
    // Por conta E por IP: criar a assinatura valida o cartão sem cobrar nada
    // na hora, e isso não pode virar um jeito de testar cartões em série.
    const [porConta, porIp] = await Promise.all([
      checkRateLimit(`assinatura:${user.id}`, 5, 10 * 60 * 1000),
      checkRateLimit(`assinatura:ip:${getClientIp(request)}`, 10, 60 * 60 * 1000),
    ]);
    if (!porConta.success || !porIp.success) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const { formData, coupon_code, valor_esperado, cartao } = (body ?? {}) as {
      formData?: Record<string, unknown>;
      coupon_code?: unknown;
      valor_esperado?: unknown;
      cartao?: { final?: unknown };
    };

    const token = formData && typeof formData.token === "string" ? formData.token : null;
    if (!token) {
      return NextResponse.json({ error: "Dados do cartão não recebidos. Preencha o formulário de novo." }, { status: 400 });
    }

    if (coupon_code) {
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

    const { data: perfil, error: erroPerfil } = await supabase
      .from("profiles")
      .select("is_vip, is_admin, current_period_end, trial_ends_at")
      .eq("id", user.id)
      .single();
    if (erroPerfil || !perfil) {
      console.error("[automatica] perfil não lido:", erroPerfil?.message);
      return NextResponse.json({ error: "Não foi possível ler sua conta. Tente de novo." }, { status: 500 });
    }
    if (perfil.is_vip || perfil.is_admin || isEmailAdmin(user.email)) {
      return NextResponse.json({ error: "Sua conta tem acesso sem cobrança." }, { status: 409 });
    }

    const admin = createAdminClient();

    // Resposta clara antes de mexer em cupom: a trava de verdade é o índice
    // único do banco, dentro de criarAssinaturaCartao.
    if (await assinaturaViva(admin, user.id)) {
      return NextResponse.json({ error: "Você já tem a renovação automática ligada.", ja_tem: true }, { status: 409 });
    }

    // Três cartões recusados em um dia: pausa. Quem tenta de verdade usa o
    // PIX ou o mês a mês; quem está testando cartões para aqui.
    const { count: falhasRecentes, error: erroFalhas } = await admin
      .from("assinaturas_cartao")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("situacao", "falhou")
      .gte("criada_em", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (erroFalhas) throw erroFalhas;
    if ((falhasRecentes ?? 0) >= 3) {
      return NextResponse.json(
        { error: "Várias tentativas recusadas hoje. Tente de novo amanhã, ou pague por PIX ou no cartão mês a mês." },
        { status: 429 }
      );
    }

    const preco = await calcularPrecoAssinatura({
      adminClient: admin,
      userId: user.id,
      codigo: coupon_code ? String(coupon_code) : null,
    });
    if (preco.erroCupom) {
      return NextResponse.json({ error: preco.erroCupom }, { status: 400 });
    }
    if (!valorConfere(valor_esperado, preco.valor)) {
      return NextResponse.json(
        {
          error: "O valor mudou desde que a tela foi aberta. Confira o novo valor antes de continuar.",
          preco: precoParaTela(preco),
        },
        { status: 409 }
      );
    }

    const payer = (formData?.payer ?? {}) as { email?: unknown };
    const payerEmail = emailDoPagador(payer.email, user.email);
    if (!payerEmail) {
      return NextResponse.json({ error: "Informe um e-mail válido no formulário do cartão." }, { status: 400 });
    }

    const bandeira = typeof formData?.payment_method_id === "string" && /^[a-z_]{2,20}$/.test(formData.payment_method_id)
      ? formData.payment_method_id
      : null;

    const host = request.headers.get("host") || "app.psisetting.com.br";
    const protocol = host.includes("localhost") ? "http" : "https";

    const r = await criarAssinaturaCartao({
      admin,
      userId: user.id,
      payerEmail,
      cardTokenId: token,
      valor: preco.valor,
      desconto: preco.desconto,
      perfil: { current_period_end: perfil.current_period_end, trial_ends_at: perfil.trial_ends_at },
      // Exigido pelo Mercado Pago sem plano; no cartão tokenizado ninguém é
      // redirecionado para lá.
      backUrl: `${protocol}://${host}/configuracoes`,
      cartaoFinal: quatroUltimos(cartao?.final),
      cartaoBandeira: bandeira,
    });

    if (r.ok) {
      return NextResponse.json({
        ok: true,
        valor: r.valor,
        // null = a primeira cobrança sai agora (em até ~1 hora).
        primeira_cobranca: r.primeiraCobranca,
        proxima_cobranca: r.proximaCobranca,
      });
    }
    if (r.status === 202) {
      return NextResponse.json({ incerto: true, error: r.erro }, { status: 202 });
    }
    return NextResponse.json({ error: r.erro, ...(r.jaTem ? { ja_tem: true } : {}) }, { status: r.status });
  } catch (error: unknown) {
    console.error("[automatica] erro ao ligar a renovação automática:", error);
    return NextResponse.json(
      { error: "Não foi possível ligar a renovação automática agora. Tente de novo em instantes." },
      { status: 500 }
    );
  }
}

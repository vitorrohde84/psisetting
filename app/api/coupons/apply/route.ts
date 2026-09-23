import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { checkRateLimit, getClientIp } from "@/utils/rate-limit";
import { resolverDescontoDeCupom, registrarResgate } from "@/utils/coupons";
import { calcularPrecoAssinatura, precoParaTela } from "@/utils/preco-assinatura";
import { PRECO_BASE, ehTipoDesconto } from "@/utils/preco-desconto";

/**
 * Aplica um cupom digitado na primeira tela do modal de assinatura.
 *
 * A11 — docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
 *
 * A validação e a concessão passaram inteiras para o servidor (service_role):
 * o catálogo de cupons deixou de ser legível pelo usuário, o contador de usos
 * agora sobe de verdade (antes o update era descartado em silêncio por falta de
 * policy, então max_uses nunca era atingido) e o resgate não pode mais ser
 * apagado pelo próprio usuário para reaplicar o mesmo cupom.
 *
 * As colunas de assinatura também deixaram de ser graváveis pelo usuário (A01),
 * então toda escrita aqui usa o client administrativo — sempre amarrada ao
 * user.id da sessão.
 *
 * VIP e dias de teste são concedidos na hora. Cupom de desconto só devolve a
 * PRÉVIA do preço: o resgate é gravado quando o pagamento é aprovado — gravar
 * aqui queimaria o cupom de quem desistisse do checkout.
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

    // Por IP e por conta: só por IP, cada conta nova (o cadastro é aberto) ou
    // cada rede móvel diferente ganhava tentativas novas de adivinhar código.
    const ip = getClientIp(request);
    const [porIp, porConta] = await Promise.all([
      checkRateLimit(`coupon:${ip}`, 8, 5 * 60 * 1000),
      checkRateLimit(`coupon:u:${user.id}`, 8, 5 * 60 * 1000),
    ]);

    if (!porIp.success || !porConta.success) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const rawCode = body?.code;

    if (typeof rawCode !== "string" || !rawCode.trim()) {
      return NextResponse.json(
        { error: "Informe um código de cupom." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const resultado = await resolverDescontoDeCupom({
      adminClient,
      code: rawCode,
      userId: user.id,
      basePrice: PRECO_BASE,
    });

    // ── Cupom de desconto: só a prévia do preço ──────────────────────────
    // Vem antes do "inválido" de propósito: um cupom que a pessoa já usa e
    // ainda vale ("Você já utilizou") deve aparecer como aplicado, não como erro.
    if (!resultado.valido || ehTipoDesconto(resultado.tipo)) {
      const preco = await calcularPrecoAssinatura({ adminClient, userId: user.id, codigo: rawCode });

      if (preco.erroCupom) {
        return NextResponse.json({ error: preco.erroCupom }, { status: 400 });
      }

      const tela = precoParaTela(preco);
      const d = tela.desconto;
      const codigo = rawCode.trim().toUpperCase();

      // O código digitado é válido, mas a pessoa já tem um desconto melhor.
      // Não se somam: avisa em vez de fingir que aplicou.
      if (!d || d.codigo !== codigo) {
        return NextResponse.json({
          success: true,
          preco: tela,
          coupon_code: null,
          message: d
            ? `Você já tem um desconto melhor em uso (${d.codigo}, ${d.descricao}). Os descontos não se somam — mantivemos o seu.`
            : "Este cupom não reduz o seu preço atual.",
        });
      }

      return NextResponse.json({
        success: true,
        preco: tela,
        coupon_code: d.origem === "cupom_novo" ? d.codigo : null,
        message: `Cupom ${d.codigo} aplicado (${d.descricao}): ${d.frase}.`,
      });
    }

    const { couponId, vip, trialDays } = resultado;

    // ── Cupom de acesso VIP ───────────────────────────────────────────────
    if (vip) {
      const { registrado } = await registrarResgate({
        adminClient,
        couponId,
        userId: user.id,
      });

      if (!registrado) {
        return NextResponse.json(
          { error: "Você já utilizou este cupom." },
          { status: 400 }
        );
      }

      const { error: vipError } = await adminClient
        .from("profiles")
        .update({ is_vip: true, subscription_status: "vip" })
        .eq("id", user.id);

      if (vipError) {
        console.error("Erro ao conceder VIP:", vipError);
        return NextResponse.json(
          { error: "Erro ao aplicar cupom. Tente novamente." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        is_vip: true,
        message: "Parabéns! Sua conta agora possui Acesso VIP Permanente!",
      });
    }

    // ── Cupom de dias de teste ────────────────────────────────────────────
    const dias = trialDays > 0 ? trialDays : 30;

    const { registrado } = await registrarResgate({
      adminClient,
      couponId,
      userId: user.id,
    });

    if (!registrado) {
      return NextResponse.json(
        { error: "Você já utilizou este cupom." },
        { status: 400 }
      );
    }

    // Soma ao que a pessoa já tem — teste que resta OU período pago —, em vez
    // de recomeçar a contagem de hoje. Sem o período pago na conta, quem já
    // pagou e usava um cupom de 30 dias ganhava só a diferença (ou nada).
    const { data: perfil } = await adminClient
      .from("profiles")
      .select("trial_ends_at, current_period_end")
      .eq("id", user.id)
      .single();

    const agora = Date.now();
    const futuros = [perfil?.trial_ends_at, perfil?.current_period_end]
      .filter(Boolean)
      .map((d) => new Date(String(d)).getTime())
      .filter((t) => Number.isFinite(t) && t > agora);
    const base = futuros.length ? Math.max(...futuros) : agora;
    const novoFim = new Date(base + dias * 24 * 60 * 60 * 1000);
    const temPeriodoPago = perfil?.current_period_end
      ? new Date(perfil.current_period_end).getTime() > agora
      : false;

    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .update({
        trial_ends_at: novoFim.toISOString(),
        // Quem está pagando continua "active" no painel; os dias extras
        // aparecem como "Ativo até" a data nova.
        ...(temPeriodoPago ? {} : { subscription_status: "trialing" }),
      })
      .eq("id", user.id);

    if (profileUpdateError) {
      console.error("Erro ao atualizar perfil:", profileUpdateError);
      return NextResponse.json(
        { error: "Erro ao atualizar seu período de testes." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      trial_days: dias,
      trial_ends_at: novoFim.toISOString(),
      message: `Cupom aplicado! Você tem ${dias} dias de acesso completo.`,
    });
  } catch (error: unknown) {
    console.error("Erro ao aplicar cupom:", error);
    return NextResponse.json(
      { error: "Erro interno ao aplicar cupom." },
      { status: 500 }
    );
  }
}

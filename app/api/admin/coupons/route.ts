import { NextResponse } from "next/server";
import { requireAdmin } from "@/utils/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { validarNovoCupom, fimDoDiaEmBrasilia, validarLimiteDeUsos } from "@/utils/cupom-admin";
import { mensalidadesRestantes } from "@/utils/preco-desconto";

interface LinhaUso {
  id: string;
  coupon_id: string;
  desconto_tipo: string | null;
  duracao_meses: number | null;
  para_sempre: boolean | null;
  mensalidades_usadas: number | null;
  encerrado_em: string | null;
  redeemed_at: string | null;
  profiles: { nome: string | null; email: string | null } | { nome: string | null; email: string | null }[] | null;
}

/**
 * Quem usa cada cupom, com quanto falta. "Em uso" = desconto que ainda vale na
 * próxima mensalidade; resgates concluídos ou encerrados aparecem como histórico.
 */
function usoPorCupom(linhas: LinhaUso[]) {
  const mapa: Record<string, Array<Record<string, unknown>>> = {};

  for (const r of linhas) {
    const perfil = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    const paraSempre = r.para_sempre === true;
    const duracao = paraSempre ? null : Number(r.duracao_meses) || 1;
    const usadas = Number(r.mensalidades_usadas) || 0;
    const ehDesconto = r.desconto_tipo === "percent" || r.desconto_tipo === "fixed";
    const restantes = ehDesconto ? mensalidadesRestantes(duracao, usadas) : 0;

    (mapa[r.coupon_id] ??= []).push({
      resgateId: r.id,
      nome: perfil?.nome ?? null,
      email: perfil?.email ?? null,
      desde: r.redeemed_at,
      usadas,
      duracaoMeses: duracao,
      paraSempre,
      restantes,
      encerrado: Boolean(r.encerrado_em),
      emUso: ehDesconto && !r.encerrado_em && (restantes === null || restantes > 0),
    });
  }

  return mapa;
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error || "Não autorizado." }, { status: 403 });
    }

    const adminClient = createAdminClient();

    // Cupons arquivados ("excluídos") somem da lista. Antes da migração
    // 20260923120000 a coluna não existe: aí lista todos.
    let { data: coupons, error } = await adminClient
      .from("coupons")
      .select("*")
      .is("arquivado_em", null)
      .order("created_at", { ascending: false });

    if (error) {
      ({ data: coupons, error } = await adminClient
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false }));
    }

    if (error) {
      console.error("Erro ao listar cupons no admin:", error);
      return NextResponse.json({ error: "Erro ao buscar cupons." }, { status: 500 });
    }

    const { data: usos, error: usoError } = await adminClient
      .from("coupon_redemptions")
      .select(
        "id, coupon_id, desconto_tipo, duracao_meses, para_sempre, mensalidades_usadas, encerrado_em, redeemed_at, profiles(nome, email)"
      )
      .order("redeemed_at", { ascending: false });

    if (usoError) {
      console.error("Erro ao listar uso de cupons:", usoError.message);
    }

    const mapa = usoPorCupom((usos ?? []) as unknown as LinhaUso[]);

    return NextResponse.json({
      coupons: (coupons || []).map((c) => {
        const usuarios = mapa[c.id] ?? [];
        return {
          ...c,
          usuarios,
          emUso: usuarios.filter((u) => u.emUso).length,
          totalResgates: usuarios.length,
        };
      }),
    });
  } catch (err: unknown) {
    console.error("Erro no GET de cupons admin:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error || "Não autorizado." }, { status: 403 });
    }

    const validacao = validarNovoCupom(await request.json());
    if (!validacao.ok) {
      return NextResponse.json({ error: validacao.erro }, { status: 400 });
    }
    const novo = validacao.valor;

    const adminClient = createAdminClient();

    // Inclui os arquivados: o código continua ocupado (UNIQUE no banco) e
    // reaproveitá-lo misturaria o histórico de dois cupons diferentes.
    const { data: existing } = await adminClient
      .from("coupons")
      .select("id")
      .eq("code", novo.code)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: `O cupom '${novo.code}' já existe.` }, { status: 400 });
    }

    const { data: newCoupon, error: insertError } = await adminClient
      .from("coupons")
      .insert(novo)
      .select()
      .single();

    if (insertError) {
      console.error("Erro ao inserir cupom:", insertError);
      return NextResponse.json({ error: "Erro ao cadastrar cupom no banco." }, { status: 500 });
    }

    return NextResponse.json({ success: true, coupon: newCoupon });
  } catch (err: unknown) {
    console.error("Erro no POST de cupons admin:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

/**
 * Só pausar/ativar, limite de usos e validade. Tipo, valor e duração não mudam
 * depois de criado: quem já usa tem a foto das condições, mas um PIX gerado e
 * ainda não pago prometeu as condições de agora — e o painel passaria a
 * mostrar um cupom diferente do que as pessoas estão usando.
 */
export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error || "Não autorizado." }, { status: 403 });
    }

    const body = await request.json();
    const { id, active } = body ?? {};

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "ID do cupom é obrigatório." }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    if (typeof active === "boolean") updates.active = active;

    if (body.max_uses !== undefined) {
      const limite = validarLimiteDeUsos(body.max_uses);
      if (!limite.ok) return NextResponse.json({ error: limite.erro }, { status: 400 });
      updates.max_uses = limite.valor;
    }

    if (body.expires_at !== undefined) {
      const validade = fimDoDiaEmBrasilia(body.expires_at);
      if (!validade.ok) return NextResponse.json({ error: validade.erro }, { status: 400 });
      updates.expires_at = validade.valor;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nada para alterar." }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: updatedCoupon, error: updateError } = await adminClient
      .from("coupons")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Erro ao atualizar cupom:", updateError);
      return NextResponse.json({ error: "Erro ao atualizar cupom." }, { status: 500 });
    }

    return NextResponse.json({ success: true, coupon: updatedCoupon });
  } catch (err: unknown) {
    console.error("Erro no PATCH de cupons admin:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

/**
 * "Excluir" = arquivar, e só para cupom que ninguém usou.
 *
 * Antes era DELETE físico com cascata: apagava junto o registro de quem usou,
 * e o desconto dessas pessoas sumia. E um PIX gerado com o cupom e pago depois
 * da exclusão não encontraria mais o cupom. Arquivado, ele sai da lista, não
 * aceita ninguém novo, e o histórico continua de pé.
 */
export async function DELETE(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error || "Não autorizado." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID é obrigatório." }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { count, error: contagemError } = await adminClient
      .from("coupon_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", id);

    if (contagemError) {
      console.error("Erro ao conferir uso do cupom:", contagemError);
      return NextResponse.json({ error: "Erro ao conferir o uso do cupom." }, { status: 500 });
    }

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `Este cupom já foi usado por ${count} pessoa(s). Pause em vez de excluir: pausado, ninguém novo usa e quem já usa continua com o desconto.`,
        },
        { status: 409 }
      );
    }

    const { error } = await adminClient
      .from("coupons")
      .update({ arquivado_em: new Date().toISOString(), active: false })
      .eq("id", id);

    if (error) {
      console.error("Erro ao arquivar cupom:", error);
      return NextResponse.json({ error: "Erro ao remover cupom." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Erro no DELETE de cupons admin:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

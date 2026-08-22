import { NextResponse } from "next/server";
import { requireAdmin } from "@/utils/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error || "Não autorizado." }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { data: coupons, error } = await adminClient
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao listar cupons no admin:", error);
      return NextResponse.json({ error: "Erro ao buscar cupons." }, { status: 500 });
    }

    return NextResponse.json({ coupons: coupons || [] });
  } catch (err: any) {
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

    const body = await request.json();
    const { code, trial_days, max_uses, expires_at } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Código do cupom é obrigatório." }, { status: 400 });
    }

    const cleanCode = code.trim().toUpperCase();
    const trialDays = Number(trial_days) > 0 ? Number(trial_days) : 30;
    const maxUses = max_uses ? Number(max_uses) : null;
    const expiresAt = expires_at ? new Date(expires_at).toISOString() : null;

    const adminClient = createAdminClient();

    // Verificar se já existe
    const { data: existing } = await adminClient
      .from("coupons")
      .select("id")
      .eq("code", cleanCode)
      .single();

    if (existing) {
      return NextResponse.json({ error: `O cupom '${cleanCode}' já existe.` }, { status: 400 });
    }

    const { data: newCoupon, error: insertError } = await adminClient
      .from("coupons")
      .insert({
        code: cleanCode,
        trial_days: trialDays,
        max_uses: maxUses,
        uses_count: 0,
        active: true,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Erro ao inserir cupom:", insertError);
      return NextResponse.json({ error: "Erro ao cadastrar cupom no banco." }, { status: 500 });
    }

    return NextResponse.json({ success: true, coupon: newCoupon });
  } catch (err: any) {
    console.error("Erro no POST de cupons admin:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error || "Não autorizado." }, { status: 403 });
    }

    const body = await request.json();
    const { id, active, max_uses, trial_days, expires_at } = body;

    if (!id) {
      return NextResponse.json({ error: "ID do cupom é obrigatório." }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const updates: Record<string, any> = {};

    if (typeof active === "boolean") updates.active = active;
    if (max_uses !== undefined) updates.max_uses = max_uses ? Number(max_uses) : null;
    if (trial_days !== undefined) updates.trial_days = Number(trial_days);
    if (expires_at !== undefined) updates.expires_at = expires_at ? new Date(expires_at).toISOString() : null;

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
  } catch (err: any) {
    console.error("Erro no PATCH de cupons admin:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

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
    const { error } = await adminClient.from("coupons").delete().eq("id", id);

    if (error) {
      console.error("Erro ao deletar cupom:", error);
      return NextResponse.json({ error: "Erro ao remover cupom." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Erro no DELETE de cupons admin:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

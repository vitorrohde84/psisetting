import { NextResponse } from "next/server";
import { requireAdmin } from "@/utils/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error || "Não autorizado." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const status = searchParams.get("status");

    const adminClient = createAdminClient();

    let query = adminClient
      .from("user_feedbacks")
      .select("*")
      .order("created_at", { ascending: false });

    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: feedbacks, error } = await query;

    if (error) {
      console.error("Erro ao listar feedbacks admin:", error);
      return NextResponse.json({ error: "Erro ao buscar feedbacks." }, { status: 500 });
    }

    return NextResponse.json({ feedbacks: feedbacks || [] });
  } catch (err: any) {
    console.error("Erro no GET de feedbacks admin:", err);
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
    const { id, status, admin_notes } = body;

    if (!id) {
      return NextResponse.json({ error: "ID do feedback é obrigatório." }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (status) updates.status = status;
    if (admin_notes !== undefined) updates.admin_notes = admin_notes;

    const { data: updatedFeedback, error: updateError } = await adminClient
      .from("user_feedbacks")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Erro ao atualizar feedback:", updateError);
      return NextResponse.json({ error: "Erro ao atualizar feedback." }, { status: 500 });
    }

    return NextResponse.json({ success: true, feedback: updatedFeedback });
  } catch (err: any) {
    console.error("Erro no PATCH de feedbacks admin:", err);
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
    const { error } = await adminClient.from("user_feedbacks").delete().eq("id", id);

    if (error) {
      console.error("Erro ao remover feedback:", error);
      return NextResponse.json({ error: "Erro ao remover feedback." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Erro no DELETE de feedback admin:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

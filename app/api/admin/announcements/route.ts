import { NextResponse } from "next/server";
import { requireAdmin } from "@/utils/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { validarLinkExterno } from "@/utils/validation";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error || "Não autorizado." }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { data: announcements, error } = await adminClient
      .from("system_announcements")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao buscar comunicados admin:", error);
      return NextResponse.json({ announcements: [] });
    }

    return NextResponse.json({ announcements: announcements || [] });
  } catch (err: unknown) {
    console.error("Erro no GET de comunicados admin:", err);
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
    const { title, message, type, active, link_url, link_label } = body;

    if (!title || !message) {
      return NextResponse.json({ error: "Título e mensagem são obrigatórios." }, { status: 400 });
    }

    // A21 — o comunicado aparece na barra superior de TODOS os psicólogos, e
    // link_url virava href sem validação nenhuma: `javascript:...` ali é XSS
    // distribuído para a base inteira a partir do painel admin.
    const linkLimpo = validarLinkExterno(link_url);
    if (link_url && !linkLimpo) {
      return NextResponse.json(
        { error: "O link deve começar com http:// ou https://." },
        { status: 400 }
      );
    }

    if (String(title).length > 200 || String(message).length > 2000) {
      return NextResponse.json(
        { error: "Título ou mensagem excedem o tamanho permitido." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { data: newAnnouncement, error: insertError } = await adminClient
      .from("system_announcements")
      .insert({
        title: title.trim(),
        message: message.trim(),
        type: type || "info",
        active: active !== undefined ? active : true,
        link_url: linkLimpo,
        link_label: link_label ? link_label.trim() : null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Erro ao criar comunicado:", insertError);
      return NextResponse.json({ error: "Erro ao salvar comunicado." }, { status: 500 });
    }

    return NextResponse.json({ success: true, announcement: newAnnouncement });
  } catch (err: unknown) {
    console.error("Erro no POST de comunicados admin:", err);
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
    const { id, active, title, message, type, link_url, link_label } = body;

    if (!id) {
      return NextResponse.json({ error: "ID é obrigatório." }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (active !== undefined) updates.active = active;
    if (title) updates.title = title.trim();
    if (message) updates.message = message.trim();
    if (type) updates.type = type;
    if (link_url !== undefined) {
      const linkLimpo = validarLinkExterno(link_url);
      if (link_url && !linkLimpo) {
        return NextResponse.json(
          { error: "O link deve começar com http:// ou https://." },
          { status: 400 }
        );
      }
      updates.link_url = linkLimpo;
    }
    if (link_label !== undefined) updates.link_label = link_label ? link_label.trim() : null;

    const { data: updatedAnnouncement, error: updateError } = await adminClient
      .from("system_announcements")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Erro ao atualizar comunicado:", updateError);
      return NextResponse.json({ error: "Erro ao atualizar comunicado." }, { status: 500 });
    }

    return NextResponse.json({ success: true, announcement: updatedAnnouncement });
  } catch (err: unknown) {
    console.error("Erro no PATCH de comunicados admin:", err);
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
    const { error } = await adminClient.from("system_announcements").delete().eq("id", id);

    if (error) {
      console.error("Erro ao remover comunicado:", error);
      return NextResponse.json({ error: "Erro ao remover comunicado." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Erro no DELETE de comunicados admin:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
    }

    const body = await request.json();
    const { category, subject, message, rating } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "A mensagem é obrigatória." }, { status: 400 });
    }

    // Buscar dados do perfil do psicólogo
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome, email")
      .eq("id", user.id)
      .single();

    const userName = profile?.nome || user.user_metadata?.full_name || user.user_metadata?.name || "Psicólogo(a)";
    const userEmail = profile?.email || user.email || "";

    const adminClient = createAdminClient();

    const { data: feedback, error: insertError } = await adminClient
      .from("user_feedbacks")
      .insert({
        user_id: user.id,
        user_name: userName,
        user_email: userEmail,
        category: category || "sugestao",
        subject: subject ? subject.trim() : null,
        message: message.trim(),
        rating: rating ? Number(rating) : null,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Erro ao salvar feedback:", insertError);
      return NextResponse.json(
        { error: "Não foi possível registrar seu feedback no momento. Tente novamente mais tarde." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Seu feedback foi enviado com sucesso! Muito obrigado por nos ajudar a melhorar o PsiSetting.",
      feedback,
    });
  } catch (err: unknown) {
    console.error("Erro no envio de feedback:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autorizado. Faça login para continuar." },
        { status: 401 }
      );
    }

    // Gerar novo token criptograficamente seguro
    const newToken = crypto.randomUUID();

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ calendar_token: newToken })
      .eq("id", user.id);

    if (updateError) {
      console.error("Erro ao regenerar token de calendário:", updateError);
      return NextResponse.json(
        { error: "Erro ao atualizar token. Tente novamente." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      calendar_token: newToken,
      message: "Novo link do calendário gerado com sucesso. O link anterior foi revogado.",
    });
  } catch (err: any) {
    console.error("Erro geral ao regenerar token:", err);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}

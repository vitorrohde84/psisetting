import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { checkRateLimit } from "@/utils/rate-limit";

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

    // Regeneração é barata para o usuário e cara para o abuso: 10 por hora.
    const limit = checkRateLimit(
      `regenerate-calendar:${user.id}`,
      10,
      60 * 60 * 1000
    );
    if (!limit.success) {
      return NextResponse.json(
        { error: "Muitas regenerações seguidas. Tente novamente mais tarde." },
        { status: 429 }
      );
    }

    // Token de 256 bits. O feed de calendário é acessado sem sessão, então este
    // valor é a única credencial daquele caminho — ver A03 na auditoria.
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const newToken = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // calendar_token deixou de ser gravável pelo próprio usuário (A01), logo a
    // escrita passa pelo service_role — ainda estritamente amarrada a user.id.
    const adminClient = createAdminClient();
    const { error: updateError } = await adminClient
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

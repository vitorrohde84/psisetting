import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * GET /api/invites
 * Lista os convites criados pelo psicólogo autenticado.
 * 
 * POST /api/invites
 * Gera um novo código de convite para o psicólogo autenticado.
 */

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { data: invites, error } = await supabase
    .from("invites")
    .select("*")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(invites || []);
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Gerar código aleatório de 12 caracteres hexadecimais
  const code = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { data, error } = await supabase
    .from("invites")
    .insert({ code, created_by: user.id })
    .select()
    .single();

  if (error) {
    console.error("Invite creation error:", error);
    return NextResponse.json(
      { error: "Erro ao gerar convite. Tente novamente." },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

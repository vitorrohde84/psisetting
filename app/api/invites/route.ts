import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkRateLimit } from "@/utils/rate-limit";

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

  // A18 — qualquer usuário autenticado emitia convites ILIMITADOS, sem cota e
  // sem rate limit, inclusive uma conta em teste gratuito. Um convite concede
  // acesso ao sistema, então isso é emissão de credencial sem teto.
  const rate = await checkRateLimit(`invite-create:${user.id}`, 10, 24 * 60 * 60 * 1000);
  if (!rate.success) {
    return NextResponse.json(
      { error: "Limite de convites por dia atingido. Tente novamente amanhã." },
      { status: 429 }
    );
  }

  // Convites pendentes em aberto também têm teto: convite não resgatado é
  // credencial viva esperando ser usada.
  const { count: pendentes } = await supabase
    .from("invites")
    .select("id", { count: "exact", head: true })
    .eq("created_by", user.id)
    .is("used_by", null);

  if ((pendentes ?? 0) >= 20) {
    return NextResponse.json(
      { error: "Você tem muitos convites em aberto. Use ou aguarde a expiração dos existentes." },
      { status: 429 }
    );
  }

  // Código de 128 bits. Com 48 bits, um atacante com paciência tenta a sorte.
  const code = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Convite eterno é credencial eterna: expira em 14 dias.
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("invites")
    .insert({ code, created_by: user.id, expires_at: expiresAt })
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

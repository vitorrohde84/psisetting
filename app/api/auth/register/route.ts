import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { checkRateLimit, getClientIp } from "@/utils/rate-limit";

/**
 * POST /api/auth/register
 * 
 * Cria uma nova conta de psicólogo usando um código de convite válido.
 * Usa o admin client (service_role) para:
 *   1. Validar o código de convite
 *   2. Criar o usuário no Supabase Auth
 *   3. Marcar o convite como utilizado
 * 
 * O trigger handle_new_user() no banco cria automaticamente
 * o perfil na tabela profiles.
 */
export async function POST(request: Request) {
  try {
    // 🛡️ Proteção Anti-Força Bruta: Máximo 5 tentativas de cadastro por IP a cada 15 minutos
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000);
    if (!rateCheck.success) {
      return NextResponse.json(
        { error: "Muitas tentativas de cadastro a partir deste endereço. Por favor, aguarde alguns minutos." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { nome, email, password, invite_code } = body;

    // Validar campos obrigatórios
    if (!nome?.trim() || !email?.trim() || !password || !invite_code?.trim()) {
      return NextResponse.json(
        { error: "Todos os campos são obrigatórios." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. Validar código de convite
    const { data: invite, error: inviteError } = await supabase
      .from("invites")
      .select("*")
      .eq("code", invite_code.trim())
      .is("used_by", null)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: "Código de convite inválido ou já utilizado." },
        { status: 400 }
      );
    }

    // 2. Criar usuário no Supabase Auth
    const { data: userData, error: createError } =
      await supabase.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true, // Convite já serve como verificação
        user_metadata: { nome: nome.trim() },
      });

    if (createError) {
      if (
        createError.message.includes("already been registered") ||
        createError.message.includes("already exists")
      ) {
        return NextResponse.json(
          { error: "Este e-mail já está cadastrado no sistema." },
          { status: 400 }
        );
      }
      console.error("Create user error:", createError);
      return NextResponse.json(
        { error: `Erro ao criar conta: ${createError.message}` },
        { status: 400 }
      );
    }

    // 3. Marcar convite como utilizado
    await supabase
      .from("invites")
      .update({
        used_by: userData.user.id,
        used_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json(
      { error: "Erro interno do servidor. Tente novamente." },
      { status: 500 }
    );
  }
}

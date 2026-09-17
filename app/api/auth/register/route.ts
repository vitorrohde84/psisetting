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
    const rateCheck = await checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000);
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

    // 1. RESERVAR o convite de forma atômica (A18)
    //
    // O fluxo anterior era check-then-write: validava, criava a conta e só
    // depois marcava o convite como usado. Duas requisições simultâneas com o
    // mesmo código passavam ambas pela validação e criavam duas contas.
    //
    // Aqui o UPDATE condicional é a trava: só uma requisição consegue passar
    // used_by de NULL para reservado, porque o Postgres serializa o UPDATE da
    // mesma linha. A reserva é desfeita se a criação da conta falhar.
    const agora = new Date().toISOString();
    // Uma reserva mais velha que 1 minuto é de uma tentativa que morreu no
    // meio; pode ser retomada.
    const reservaExpirada = new Date(Date.now() - 60_000).toISOString();

    const { data: invite, error: inviteError } = await supabase
      .from("invites")
      .update({ reserved_at: agora })
      .eq("code", invite_code.trim())
      .is("used_by", null)
      .or(`reserved_at.is.null,reserved_at.lt.${reservaExpirada}`)
      .select()
      .single();

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: "Código de convite inválido ou já utilizado." },
        { status: 400 }
      );
    }

    // Expiração não corre risco de corrida, então é checada depois da reserva.
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      await supabase.from("invites").update({ reserved_at: null }).eq("id", invite.id);
      return NextResponse.json(
        { error: "Este convite expirou. Peça um novo ao responsável." },
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
      // Libera a reserva: a tentativa falhou, o convite continua válido.
      await supabase.from("invites").update({ reserved_at: null }).eq("id", invite.id);

      // A22 — a mensagem distinta para "já cadastrado" transformava esta rota
      // num oráculo: dava para descobrir se um psicólogo é cliente do sistema.
      // A resposta agora é a mesma para qualquer falha de criação, e o motivo
      // real fica no log do servidor.
      console.error("Create user error:", createError);
      return NextResponse.json(
        {
          error:
            "Não foi possível concluir o cadastro com estes dados. Verifique o e-mail informado ou tente fazer login.",
        },
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

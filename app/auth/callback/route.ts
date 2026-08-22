import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * GET /auth/callback
 * 
 * Rota de callback do Supabase Auth para OAuth (Google, etc.) e Magic Links.
 * Troca o código 'code' recebido por uma sessão autenticada persistida
 * nos cookies HTTP seguros da aplicação Next.js.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/";

  // Obter o host e protocolo corretos (considerando proxy reverso da Vercel / domínios customizados)
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || requestUrl.host;
  const proto = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        return NextResponse.redirect(new URL(next, origin));
      }

      console.error("Erro na troca de código de autenticação Supabase:", error);
      return NextResponse.redirect(
        new URL(
          `/login?error=auth_callback_failed&details=${encodeURIComponent(error.message)}`,
          origin
        )
      );
    } catch (err: any) {
      console.error("Exceção no auth callback:", err);
      return NextResponse.redirect(
        new URL(
          `/login?error=auth_callback_failed&details=${encodeURIComponent(err?.message || "Erro de conexão")}`,
          origin
        )
      );
    }
  }

  // Redireciona de volta para o login caso não tenha recebido o code
  return NextResponse.redirect(
    new URL("/login?error=auth_callback_failed&details=missing_code", origin)
  );
}

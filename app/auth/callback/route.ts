import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * GET /auth/callback
 * 
 * Rota oficial de callback do Supabase Auth para OAuth (Google) e Magic Links.
 * Troca o código 'code' recebido por uma sessão persistida diretamente nos cookies
 * da resposta HTTP enviada ao navegador.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/";

  // Obter a URL de origem real respeitando proxies da Vercel
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || requestUrl.host;
  const proto = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  if (code) {
    // Cria a resposta de redirecionamento para mutar os cookies diretamente nela
    const response = NextResponse.redirect(new URL(next, origin));

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        return response;
      }

      console.error("Erro no exchangeCodeForSession:", error);
      return NextResponse.redirect(
        new URL(
          `/login?error=auth_callback_failed&details=${encodeURIComponent(error.message)}`,
          origin
        )
      );
    } catch (err: unknown) {
      console.error("Exceção no auth callback:", err);
      // Lê `message` de qualquer objeto lançado (não só de Error), como o
      // `err?.message` de antes: o texto enviado ao /login continua o mesmo.
      const mensagem =
        typeof err === "object" && err !== null && "message" in err
          ? (err as { message?: unknown }).message
          : undefined;
      return NextResponse.redirect(
        new URL(
          `/login?error=auth_callback_failed&details=${encodeURIComponent(String(mensagem || "Erro inesperado"))}`,
          origin
        )
      );
    }
  }

  // Redireciona de volta para o login caso não haja code
  return NextResponse.redirect(
    new URL("/login?error=auth_callback_failed&details=missing_code", origin)
  );
}

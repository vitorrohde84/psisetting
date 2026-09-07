import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const host = request.headers.get("host") || "";
  const isAppSubdomain = host.startsWith("app.") || host.includes("app.psisetting.com.br");
  const isLandingHost =
    host === "psisetting.com.br" ||
    host === "www.psisetting.com.br" ||
    (host.startsWith("www.") && !host.includes("localhost"));

  // 1. ROTEAMENTO ULTRA-RÁPIDO PARA LANDING PAGE (Sem chamar Supabase Auth)
  if (isLandingHost) {
    if (pathname === "/") {
      return NextResponse.rewrite(new URL("/landing", request.url));
    }
    if (pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("https://app.psisetting.com.br/login"));
    }
  }

  // 2. ROTEAMENTO PARA O SUBDOMÍNIO APP
  if (isAppSubdomain) {
    if (pathname.startsWith("/landing")) {
      return NextResponse.redirect(new URL("https://www.psisetting.com.br"));
    }
  }

  const isLoginPath = pathname.startsWith("/login");
  const isCalendarPath = pathname.startsWith("/calendario");
  const isLandingPath = pathname.startsWith("/landing");
  const isTermosPath = pathname.startsWith("/termos");
  const isPrivacidadePath = pathname.startsWith("/privacidade");
  const isAuthCallback = pathname.startsWith("/auth/callback");
  const isRegisterApi = pathname.startsWith("/api/auth/register");
  const isWebhookApi = pathname.startsWith("/api/webhooks");

  const isPublicPath =
    isCalendarPath ||
    isLandingPath ||
    isTermosPath ||
    isPrivacidadePath ||
    isAuthCallback ||
    isRegisterApi ||
    isWebhookApi;

  // 3. Rotas públicas não autenticadas passam direto (0 latência)
  if (isPublicPath) {
    return NextResponse.next({ request });
  }

  // 4. Criação do cliente Supabase e checagem de sessão apenas para rotas que realmente precisam
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Implement 30-minute inactivity timeout for clinical data protection (CFP / LGPD)
  const lastActivity = request.cookies.get("last_activity")?.value;
  const now = Date.now();
  const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  if (user && lastActivity && now - parseInt(lastActivity, 10) > TIMEOUT_MS) {
    // Sign out user due to inactivity
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("expired", "true");
    
    // Create new response to redirect and clear activity cookie
    const response = NextResponse.redirect(url);
    response.cookies.delete("last_activity");
    return response;
  }

  // Update last_activity if authenticated
  if (user) {
    supabaseResponse.cookies.set("last_activity", now.toString(), {
      path: "/",
      maxAge: 30 * 60, // 30 minutes
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  // If user is not authenticated and trying to access a protected route (that is not public and not login)
  if (!user && !isPublicPath && !isLoginPath) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Não autorizado. Faça login para continuar." },
        { status: 401 }
      );
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If user IS authenticated and trying to access /login, redirect to dashboard
  if (user && isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

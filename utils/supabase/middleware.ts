import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
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

  // IMPORTANT: Do NOT use supabase.auth.getSession() here.
  // getUser() validates the token against Supabase Auth server every time.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPath = request.nextUrl.pathname.startsWith("/login");
  const isCalendarPath = request.nextUrl.pathname.startsWith("/calendario");
  const isLandingPath = request.nextUrl.pathname.startsWith("/landing");
  const isPublicPath = isLoginPath || isCalendarPath || isLandingPath;

  // Implement 30-minute inactivity timeout
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
    });
  }

  // If user is not authenticated and trying to access a private route, redirect to /login
  if (!user && !isPublicPath) {
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

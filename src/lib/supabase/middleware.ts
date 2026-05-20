import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Skip auth check if Supabase is not configured yet
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
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

  // Refresh the session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth/callback") || pathname.startsWith("/api/auth");
  const isPublicRoute = pathname === "/";

  // Redirect authenticated users away from login page — but only if their
  // user_profiles row exists and is active. Without this check, an auth
  // session with a missing/inactive profile causes a redirect loop:
  // /dashboard → getCurrentUser() returns null → redirect("/login") →
  // proxy sees user → redirect("/dashboard") → repeat.
  if (user && pathname === "/login") {
    if (user.email && process.env.NEXT_PUBLIC_SERVICE_ROLE_KEY) {
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SERVICE_ROLE_KEY
      );
      const { data: profile, error: profileError } = await admin
        .schema("hris")
        .from("user_profiles")
        .select("is_active, email")
        .eq("email", user.email)
        .maybeSingle();

      if (profileError) {
        console.error("[proxy] user_profiles lookup failed for", user.email, "-", profileError.message);
      }

      if (!profile || !profile.is_active) {
        // Stale session — clear it and let them stay on /login.
        await supabase.auth.signOut();
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("error", "unauthorized");
        const redirectResponse = NextResponse.redirect(url);
        // Carry over the session-clearing cookies that signOut() wrote
        // onto supabaseResponse — without this, the browser keeps the
        // old auth cookie and the loop continues.
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie);
        });
        return redirectResponse;
      }
    }

    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Protect all non-public routes
  if (!user && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

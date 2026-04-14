import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    console.error("[auth/callback] No code in URL");
    return NextResponse.redirect(new URL("/login?error=no_code", origin));
  }

  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("[auth/callback] Exchange error:", exchangeError.message);
      return NextResponse.redirect(new URL("/login?error=exchange_failed", origin));
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("[auth/callback] getUser error:", userError.message);
      return NextResponse.redirect(new URL("/login?error=get_user_failed", origin));
    }

    if (!user?.email) {
      console.error("[auth/callback] No email on user");
      return NextResponse.redirect(new URL("/login?error=no_email", origin));
    }

    console.log("[auth/callback] User email:", user.email);

    // Use admin client to bypass RLS for the allowlist check
    const adminClient = createAdminClient();

    const { data: profile, error: profileError } = await adminClient
      .schema("hris")
      .from("user_profiles")
      .select("id, is_active")
      .eq("email", user.email)
      .maybeSingle();

    if (profileError) {
      console.error("[auth/callback] Profile query error:", profileError.message);
      return NextResponse.redirect(new URL("/login?error=profile_query_failed", origin));
    }

    console.log("[auth/callback] Profile found:", profile);

    if (!profile || !profile.is_active) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=unauthorized", origin));
    }

    return NextResponse.redirect(new URL("/dashboard", origin));
  } catch (err) {
    console.error("[auth/callback] Unexpected error:", err);
    return NextResponse.redirect(new URL("/login?error=unexpected", origin));
  }
}

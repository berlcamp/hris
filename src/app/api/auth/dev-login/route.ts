import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isScanOnlyAccount, normalizeRoles } from "@/lib/auth-helpers";

/**
 * Password sign-in for the local Docker stack, where Google OAuth cannot work:
 * Google will not redirect to a Supabase project that only exists on
 * 127.0.0.1, so /auth/callback is unreachable and there is no other way in.
 *
 * It refuses to run unless the app is pointed at a local Supabase URL and
 * DEV_LOGIN_PASSWORD is set — both only true via the gitignored
 * .env.development.local / .env.production.local — so shipping it to
 * production leaves a route that answers 404 and nothing else.
 *
 * GET /api/auth/dev-login            → pick an allowlisted account
 * GET /api/auth/dev-login?email=you@example.com → sign in as that account
 */

function devLoginEnabled(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const isLocalStack =
    url.includes("127.0.0.1") || url.includes("localhost");

  // NODE_ENV is deliberately not part of this test: `npm run build` / `npm start`
  // run as production against the local stack (see .env.production.local), and a
  // production build still needs a way in. What gates the route is the Supabase
  // URL — the deployed app points at the hosted project, so this answers 404
  // there — plus a password that only ever lives in a gitignored env file.
  return isLocalStack && Boolean(process.env.DEV_LOGIN_PASSWORD);
}

export async function GET(request: NextRequest) {
  if (!devLoginEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { searchParams, origin } = new URL(request.url);
  const email = searchParams.get("email");
  const adminClient = createAdminClient();

  // No account named yet — list the allowlist so any role can be tried without
  // looking up emails by hand.
  if (!email) {
    const { data: profiles } = await adminClient
      .schema("hris")
      .from("user_profiles")
      .select("email, full_name, role")
      .eq("is_active", true)
      .order("role")
      .order("email");

    const rows = (profiles ?? [])
      .map(
        (p) =>
          `<tr><td><a href="/api/auth/dev-login?email=${encodeURIComponent(p.email)}">${p.email}</a></td>` +
          `<td>${p.full_name}</td><td><code>${p.role}</code></td></tr>`,
      )
      .join("");

    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><title>Dev login</title>` +
        `<style>body{font:14px system-ui;margin:2rem}td{padding:.25rem .75rem;border-bottom:1px solid #eee}` +
        `h1{font-size:1rem}code{color:#555}</style>` +
        `<h1>Local dev login — ${(profiles ?? []).length} allowlisted accounts</h1>` +
        `<table>${rows}</table>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

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
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: process.env.DEV_LOGIN_PASSWORD!,
  });

  if (error) {
    return new NextResponse(`Dev sign-in failed: ${error.message}`, {
      status: 401,
    });
  }

  // Same allowlist check and landing rule as src/app/auth/callback/route.ts, so
  // signing in locally lands where signing in with Google would.
  const { data: profile } = await adminClient
    .schema("hris")
    .from("user_profiles")
    .select("is_active, role, roles")
    .eq("email", email)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=unauthorized", origin));
  }

  const scanOnly = isScanOnlyAccount(normalizeRoles(profile.roles, profile.role));

  return NextResponse.redirect(new URL(scanOnly ? "/scan" : "/dashboard", origin));
}

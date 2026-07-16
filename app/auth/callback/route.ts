import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Same-origin path guard for `?next=` — mirror of the one in
 * app/(auth)/actions.ts (route files may only export HTTP handlers).
 */
function sanitizeNextPath(next: string | null): string {
  if (typeof next !== "string") return "/account";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
    ? next
    : "/account";
}

/**
 * Email-confirmation / PKCE landing. Supabase redirects here with a `code`;
 * exchanging it signs the user in (the server client writes the session
 * cookies — cookies() is writable in route handlers). Anything that isn't a
 * clean exchange (missing/expired code, unconfigured env) lands on
 * /login?error=auth, which renders a friendly retry notice.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = sanitizeNextPath(url.searchParams.get("next"));

  if (isSupabaseConfigured() && code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}

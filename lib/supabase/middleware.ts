import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and rewrites the
 * response cookies. Role-based route guards are layered on top of this in
 * Phase 2 once auth exists. When Supabase is not yet configured (Phase 0), this
 * is a safe no-op so the site runs without any backend.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Skip when Supabase isn't configured yet, or still holds the example
  // placeholder values, so the site runs without any backend.
  if (!url || !anonKey || url.includes("YOUR-PROJECT") || anonKey === "your-anon-key") {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touch the user to trigger a token refresh when needed. Do not add logic
  // between client creation and this call (Supabase SSR guidance). Guard against
  // an unreachable/misconfigured project so it can never 500 the whole site.
  try {
    await supabase.auth.getUser();
  } catch {
    // Supabase unreachable — proceed unauthenticated.
  }

  return response;
}

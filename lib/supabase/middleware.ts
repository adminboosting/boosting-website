import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Route prefixes that require a signed-in user. Redirect-only, per the
 * security boundary rule in proxy.ts — every server action, route handler,
 * and layout behind these prefixes re-verifies identity independently.
 */
const PROTECTED_PREFIXES = ["/account", "/orders", "/checkout", "/admin"];

/** Auth pages a signed-in visitor has no business on — send them to /account. */
const AUTH_PATHS: readonly string[] = ["/login", "/sign-up"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Build a redirect that carries over any refreshed session cookies from the
 * in-flight response. Dropping them here could discard a rotated refresh
 * token and sign the user out on their very next request.
 */
function redirectWithSessionCookies(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
  next?: string,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (next) {
    url.searchParams.set("next", next);
  }

  const redirect = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

/**
 * Refreshes the Supabase auth session on every request and rewrites the
 * response cookies, then applies the Phase 2 redirect layer: unauthenticated
 * visitors leave the private route groups, signed-in visitors skip the auth
 * pages. Redirects only — never authorization (see proxy.ts). When Supabase is
 * not yet configured (Phase 0), this is a safe no-op so the site runs without
 * any backend.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  // Skip when Supabase isn't configured yet, or still holds the example
  // placeholder values, so the site runs without any backend.
  if (!isSupabaseConfigured()) {
    return response;
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
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touch the user to trigger a token refresh when needed. Do not add logic
  // between client creation and this call (Supabase SSR guidance). Guard against
  // an unreachable/misconfigured project so it can never 500 the whole site.
  let user: User | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Supabase unreachable — proceed unauthenticated.
  }

  const { pathname } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    return redirectWithSessionCookies(request, response, "/login", pathname);
  }

  if (user && AUTH_PATHS.includes(pathname)) {
    return redirectWithSessionCookies(request, response, "/account");
  }

  return response;
}

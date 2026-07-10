import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * `proxy.ts` replaces the `middleware.ts` file convention as of Next.js 16
 * (we're on 16.2.10). It refreshes the Supabase auth session on matched requests
 * and, from Phase 2, redirects unauthenticated visitors away from private route
 * groups.
 *
 * ⚠️ SECURITY BOUNDARY RULE (spec A2) — this file is a redirect/UX layer ONLY.
 * It is NOT a security boundary and no protected action may rely on it. Auth is
 * enforced in three independent layers; every one must hold on its own:
 *
 *   1. proxy.ts        — may only *redirect* unauthenticated visitors. It never
 *                        grants access and its checks are never the last word.
 *   2. Server Actions
 *      & Route Handlers — MUST independently verify identity AND resource
 *                        ownership on every call (re-fetch the user, re-check
 *                        that the row belongs to them), assuming proxy.ts ran
 *                        not at all.
 *   3. Row-Level Security — the final gate in Postgres. Even a bug in layers 1–2
 *                        cannot leak another user's data. Credentials deny all
 *                        PostgREST access outright.
 *
 * Do not move an authorization check *out* of layer 2 or 3 and into this file.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all request paths except:
     * - static asset files and Next internals (_next/static, _next/image)
     * - the favicon and common image/font extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};

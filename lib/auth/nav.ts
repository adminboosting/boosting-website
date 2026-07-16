/**
 * Role → account-nav mapping for the header's account slot. Pure and
 * dependency-free on purpose: `components/site/account-menu.tsx` renders it in
 * a server component, and the fast unit suite imports it directly.
 *
 * The ONLY import is `import type` from session.ts — types are erased at
 * compile time, so the "server-only" guard inside that module never enters
 * this file's runtime graph (risk #4 in the Phase 3 plan).
 *
 * These links are navigation sugar, not a security boundary: /booster and
 * /admin layouts re-verify the role server-side (requireBooster/requireAdmin)
 * and RLS is the final gate underneath.
 */
import type { AppRole } from "@/lib/auth/session";

export interface AccountNavLink {
  href: string;
  label: string;
}

/**
 * Links for the signed-in account menu, primary first. Every signed-in role
 * gets "My orders"; boosters and admins get exactly one extra link to their
 * desk. `null` (profile row not readable yet — the transient window before
 * the on_auth_user_created trigger lands) degrades to the customer baseline.
 *
 * Returns a fresh array per call — callers may mutate their copy freely.
 */
export function accountNavLinks(role: AppRole | null): AccountNavLink[] {
  const links: AccountNavLink[] = [{ href: "/account", label: "My orders" }];
  if (role === "booster") links.push({ href: "/booster", label: "Booster desk" });
  if (role === "admin") links.push({ href: "/admin", label: "Admin" });
  return links;
}

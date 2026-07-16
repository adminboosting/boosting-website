/**
 * Session identity helpers — the single identity source for Server Components,
 * server actions, and route handlers (spec A2 layer 2). The proxy middleware
 * only REDIRECTS; every server surface re-verifies identity through these
 * helpers independently, and RLS remains the final layer underneath.
 *
 * All helpers degrade gracefully in the zero-backend deploy: when
 * isSupabaseConfigured() is false they report "signed out" instead of touching
 * a client that would fail against placeholder env.
 */
import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { maybeBootstrapAdmin } from "@/lib/auth/bootstrap";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Mirrors the `app_role` enum (supabase/migrations/0001_foundation.sql). */
export type AppRole = "customer" | "booster" | "admin";

/**
 * The profiles columns session-aware surfaces need, as PostgREST returns them
 * (snake_case). Money is integer cents.
 */
export interface SessionProfile {
  id: string;
  role: AppRole;
  display_name: string | null;
  email: string | null;
  lifetime_spend_cents: number;
  store_credit_cents: number;
}

/** A verified user plus their profile row. */
export interface SessionContext {
  user: User;
  profile: SessionProfile;
}

/**
 * The authenticated Supabase user, or null. auth.getUser() revalidates the
 * token against Supabase Auth — never trust the cookie payload alone.
 */
export async function getSessionUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * The authenticated user plus their profiles row (self-read allowed by RLS
 * `profiles_select_self_or_admin`). Runs maybeBootstrapAdmin BEFORE the read
 * so the ADMIN_BOOTSTRAP_EMAIL promotion happens on the first authenticated
 * page view and the returned profile already carries the promoted role.
 *
 * Returns null when signed out, or in the (transient) window before the
 * `on_auth_user_created` trigger has created the profile row.
 */
export async function getSessionProfile(): Promise<SessionContext | null> {
  const user = await getSessionUser();
  if (!user) return null;

  await maybeBootstrapAdmin(user);

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, role, display_name, email, lifetime_spend_cents, store_credit_cents")
    .eq("id", user.id)
    .maybeSingle();

  const profile = data as SessionProfile | null;
  return profile ? { user, profile } : null;
}

/**
 * Require a signed-in user; redirects to /login otherwise. redirect() throws
 * NEXT_REDIRECT — keep calls outside try/catch (or rethrow) in server actions.
 */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Require a signed-in admin. Signed out → /login; signed in but not admin →
 * home (the admin area is unadvertised, so a plain redirect beats a 403).
 * Server actions and layouts under app/(admin) call this even though the
 * proxy also redirects — layers 2/3 must hold alone.
 */
export async function requireAdmin(): Promise<SessionContext> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.profile.role !== "admin") redirect("/");
  return session;
}

/**
 * Require a signed-in booster. Admins pass too, so the owner can inspect the
 * booster surface. Signed out → /login; any other role → home (the booster
 * area is unadvertised — same posture as requireAdmin). Layouts, pages, and
 * server actions under app/(booster) call this independently; RLS
 * (can_access_order) remains the final layer underneath.
 */
export async function requireBooster(): Promise<SessionContext> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.profile.role !== "booster" && session.profile.role !== "admin") redirect("/");
  return session;
}

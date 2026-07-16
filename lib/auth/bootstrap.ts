/**
 * Admin bootstrap: the first user whose email matches ADMIN_BOOTSTRAP_EMAIL is
 * promoted to admin in app code — the SQL schema deliberately ships no
 * bootstrap path (0001_foundation.sql). The promotion MUST run on the
 * service-role client: the `profiles_guard_role` trigger raises
 * 'only admins may change a profile role' for role changes made while
 * `current_user = 'authenticated'`, so the session client can never do this.
 */
import "server-only";
import { shouldBootstrap } from "@/lib/auth/bootstrap-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";

// Re-exported for server callers; tests import the pure core directly from
// bootstrap-core.ts (this module's "server-only" is unresolvable in plain Node).
export { shouldBootstrap } from "@/lib/auth/bootstrap-core";

/** The identity fields the promotion needs; matches supabase-js `User`. */
interface BootstrapUser {
  id: string;
  email?: string | null;
}

/**
 * Promote `user` to admin when their email matches ADMIN_BOOTSTRAP_EMAIL.
 * Returns true only when a promotion actually happened this call.
 *
 * Safe to call on every authenticated page view (getSessionProfile does):
 * no-ops (false) when the variable is unset, the email mismatches, the
 * service role is not configured, or the profile role is already
 * non-customer — the `role = 'customer'` predicate makes repeat calls (and
 * later manual role changes) untouchable, so the promotion is idempotent.
 */
export async function maybeBootstrapAdmin(user: BootstrapUser): Promise<boolean> {
  if (!isServiceRoleConfigured()) return false;
  if (!shouldBootstrap(user.email, process.env.ADMIN_BOOTSTRAP_EMAIL)) return false;

  const admin = createAdminClient();

  const { data: promoted, error } = await admin
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", user.id)
    .eq("role", "customer")
    .select("id");

  // Error or zero rows updated (already admin/booster, or profile row not yet
  // created) — nothing happened, nothing to audit.
  if (error || !promoted || promoted.length === 0) return false;

  // Best-effort audit trail; the promotion stands even if this insert fails.
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "admin.bootstrap",
    entity: "profiles",
    entity_id: user.id,
  });

  return true;
}

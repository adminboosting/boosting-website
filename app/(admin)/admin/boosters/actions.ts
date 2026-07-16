"use server";

import { revalidatePath } from "next/cache";
import type { AdminActionState } from "@/app/(admin)/admin/orders/actions";
import { requireAdmin } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/schemas/admin-ops";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";

/**
 * Booster roster mutations. Both actions are service-role by necessity, not
 * convenience: booster_profiles has NO authenticated INSERT grant (0005), so
 * the service role is the only path that can create the 1:1 row, and the
 * profiles_guard_role trigger (0001) treats server contexts as trusted for the
 * role flip. tests/db/admin-ops-rls.test.ts pins the grant so nobody "fixes"
 * it by widening. Each action re-verifies the admin role itself — the layout
 * redirect is not authorization.
 */

/** Returned by promoteBooster via useActionState in the promote form. */
export interface PromoteBoosterState {
  ok: boolean;
  error: string | null;
  /** Email (or id) of the user just promoted, for the success notice. */
  promoted: string | null;
}

interface ProfileRow {
  id: string;
  role: "customer" | "booster" | "admin";
  email: string | null;
  display_name: string | null;
}

/**
 * Promote a user to booster by email or user id. Sets profiles.role='booster'
 * and upserts the booster_profiles row (re-promoting a demoted booster
 * re-opens is_accepting).
 */
export async function promoteBooster(
  _prev: PromoteBoosterState,
  formData: FormData,
): Promise<PromoteBoosterState> {
  // Identity first — outside any try/catch (redirect throws NEXT_REDIRECT).
  const session = await requireAdmin();

  if (!isServiceRoleConfigured()) {
    return {
      ok: false,
      error: "Boosters can't be managed on this deployment yet.",
      promoted: null,
    };
  }

  const raw = formData.get("identifier");
  const identifier = typeof raw === "string" ? raw.trim() : "";
  if (identifier.length === 0) {
    return { ok: false, error: "Enter the user's email or id.", promoted: null };
  }

  const admin = createAdminClient();

  // Resolve email-or-uuid to a profile. Email match is exact (profiles.email
  // is written lowercase by the auth trigger; normalize the input the same way).
  const lookup = admin.from("profiles").select("id, role, email, display_name");
  const { data: profileData } = uuidSchema.safeParse(identifier).success
    ? await lookup.eq("id", identifier).maybeSingle()
    : await lookup.eq("email", identifier.toLowerCase()).maybeSingle();
  const profile = profileData as ProfileRow | null;
  if (!profile) {
    return { ok: false, error: "No user with that email or id.", promoted: null };
  }
  if (profile.role === "admin") {
    return { ok: false, error: "That user is an admin — demote them first.", promoted: null };
  }
  if (profile.role === "booster") {
    return { ok: false, error: "Already a booster.", promoted: null };
  }

  // Role flip via the service role — the profiles_guard_role trigger only
  // blocks role changes from the `authenticated` PostgREST role.
  const { error: roleError } = await admin
    .from("profiles")
    .update({ role: "booster" })
    .eq("id", profile.id);
  if (roleError) {
    return { ok: false, error: "Couldn't update the user's role — try again.", promoted: null };
  }

  // 1:1 booster row. Upsert (not insert) so a demoted booster keeps their
  // stats; is_accepting re-opens either way. Service-role only — no
  // authenticated INSERT grant exists on booster_profiles by design.
  const { error: boosterError } = await admin
    .from("booster_profiles")
    .upsert({ id: profile.id, is_accepting: true }, { onConflict: "id" });
  if (boosterError) {
    console.error(
      `[admin] booster_profiles upsert failed for ${profile.id}:`,
      boosterError.message,
    );
    return {
      ok: false,
      error: "Role updated, but the booster profile failed — retry to finish setup.",
      promoted: null,
    };
  }

  // Best-effort audit trail; the promotion stands even if this insert fails.
  await admin.from("audit_log").insert({
    actor_id: session.user.id,
    action: "booster.promoted",
    entity: "profiles",
    entity_id: profile.id,
    meta: { email: profile.email },
  });

  revalidatePath("/admin/boosters");
  return { ok: true, error: null, promoted: profile.email ?? profile.id };
}

/**
 * Demote a booster back to customer. Refused while they hold an active
 * assignment — unassign on the order page first, so no order silently loses
 * coverage. is_accepting flips false so stale assign dropdowns can't pick
 * them up again.
 */
export async function demoteBooster(userId: string): Promise<AdminActionState> {
  // Identity first — outside any try/catch (redirect throws NEXT_REDIRECT).
  const session = await requireAdmin();

  if (!isServiceRoleConfigured()) {
    return { ok: false, error: "Boosters can't be managed on this deployment yet." };
  }
  if (!uuidSchema.safeParse(userId).success) {
    return { ok: false, error: "Unknown user." };
  }

  const admin = createAdminClient();

  const { data: profileData } = await admin
    .from("profiles")
    .select("id, role, email")
    .eq("id", userId)
    .maybeSingle();
  const profile = profileData as Pick<ProfileRow, "id" | "role" | "email"> | null;
  if (!profile || profile.role !== "booster") {
    return { ok: false, error: "That user isn't a booster." };
  }

  const { data: activeAssignments } = await admin
    .from("order_assignments")
    .select("order_id")
    .eq("booster_id", profile.id)
    .eq("is_active", true)
    .limit(1);
  if (activeAssignments && activeAssignments.length > 0) {
    return { ok: false, error: "This booster has an active assignment — unassign it first." };
  }

  const { error: roleError } = await admin
    .from("profiles")
    .update({ role: "customer" })
    .eq("id", profile.id);
  if (roleError) {
    return { ok: false, error: "Couldn't update the user's role — try again." };
  }

  const { error: acceptingError } = await admin
    .from("booster_profiles")
    .update({ is_accepting: false })
    .eq("id", profile.id);
  if (acceptingError) {
    console.error(`[admin] is_accepting flip failed for ${profile.id}:`, acceptingError.message);
  }

  // Best-effort audit trail; the demotion stands even if this insert fails.
  await admin.from("audit_log").insert({
    actor_id: session.user.id,
    action: "booster.demoted",
    entity: "profiles",
    entity_id: profile.id,
    meta: { email: profile.email },
  });

  revalidatePath("/admin/boosters");
  return { ok: true, error: null };
}

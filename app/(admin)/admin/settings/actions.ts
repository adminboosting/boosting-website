"use server";

import { revalidatePath } from "next/cache";
import type { AdminActionState } from "@/app/(admin)/admin/orders/actions";
import { requireAdmin, type SessionContext } from "@/lib/auth/session";
import { allMoneyPagePaths } from "@/lib/catalog/content";
import {
  SITE_SETTING_KEYS,
  siteSettingSchema,
  type SiteSettingInput,
} from "@/lib/schemas/admin-ops";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";

/**
 * site_settings mutations. GRANT TRAP (0001): authenticated holds a SELECT
 * grant only, so even an admin is grant-blocked from PostgREST writes despite
 * the site_settings_write_admin FOR ALL policy — every write here goes through
 * the service role. Do NOT "fix" this by granting DML to authenticated; the
 * asymmetry is deliberate (public read, server-mediated write) and
 * regression-pinned by tests/db/admin-ops-rls.test.ts. Reads on the settings
 * page stay user-scoped — only writes need the service role.
 */

/** Returned by saveSiteSetting via useActionState in settings/setting-form.tsx. */
export interface SettingFormState {
  ok: boolean;
  error: string | null;
}

/** Keys whose jsonb value is structured (edited as raw JSON, parsed before zod). */
const JSON_VALUE_KEYS: readonly string[] = ["pricing_settings", "pricing_reviewed"];

/**
 * The public money pages are SSG + 1h ISR (app/(marketing)/[game] and
 * [game]/[service] both export `revalidate = 3600`) and read pricing_settings
 * through the DB catalog source — revalidate them after every settings change
 * so a price-knob edit shows up immediately instead of within the hour.
 * Duplicated in coupons/actions.ts — a "use server" file may only export
 * async functions, so the helper can't be shared from either.
 */
function revalidateMoneyPages(): void {
  const hubs = new Set<string>();
  for (const { game, service } of allMoneyPagePaths()) {
    hubs.add(game);
    revalidatePath(`/${game}/${service}`);
  }
  for (const game of hubs) {
    revalidatePath(`/${game}`);
  }
}

/** Shared write path: service-role upsert + audit + ISR revalidation. */
async function persistSetting(
  session: SessionContext,
  input: SiteSettingInput,
): Promise<AdminActionState> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("site_settings")
    .upsert({ key: input.key, value: input.value }, { onConflict: "key" });
  if (error) {
    return { ok: false, error: "Couldn't save the setting — refresh and try again." };
  }

  // Best-effort audit trail; the write stands even if this insert fails.
  await admin.from("audit_log").insert({
    actor_id: session.user.id,
    action: "settings.updated",
    entity: "site_settings",
    entity_id: input.key,
    meta: { key: input.key },
  });

  revalidatePath("/admin/settings");
  revalidateMoneyPages();
  return { ok: true, error: null };
}

/**
 * The launch gate: flips site_settings.pricing_reviewed. Bound per-direction
 * by the settings page (`setPricingReviewed.bind(null, true)`) so the toggle
 * rides the standard AdminActionButton.
 */
export async function setPricingReviewed(value: boolean): Promise<AdminActionState> {
  // Identity first — outside any try/catch (redirect throws NEXT_REDIRECT).
  const session = await requireAdmin();

  if (!isServiceRoleConfigured()) {
    return { ok: false, error: "Settings can't be changed on this deployment yet." };
  }

  // Strictly boolean — the schema rejects truthy strings by design.
  const parsed = siteSettingSchema.safeParse({ key: "pricing_reviewed", value });
  if (!parsed.success) {
    return { ok: false, error: "Invalid value." };
  }
  return persistSetting(session, parsed.data);
}

/**
 * Generic editor for the remaining seeded keys. String keys take the raw
 * input; JSON keys (pricing_settings) are parsed first so malformed JSON is a
 * typed error, never a stored string-in-jsonb. Unknown keys are rejected by
 * SITE_SETTING_KEYS before anything touches the database.
 */
export async function saveSiteSetting(
  _prev: SettingFormState,
  formData: FormData,
): Promise<SettingFormState> {
  // Identity first — outside any try/catch (redirect throws NEXT_REDIRECT).
  const session = await requireAdmin();

  if (!isServiceRoleConfigured()) {
    return { ok: false, error: "Settings can't be changed on this deployment yet." };
  }

  const keyRaw = formData.get("key");
  const key = typeof keyRaw === "string" ? keyRaw : "";
  if (!(SITE_SETTING_KEYS as readonly string[]).includes(key)) {
    return { ok: false, error: "Unknown setting." };
  }

  const valueRaw = formData.get("value");
  const text = typeof valueRaw === "string" ? valueRaw : "";

  let value: unknown = text.trim();
  if (JSON_VALUE_KEYS.includes(key)) {
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, error: "Value must be valid JSON." };
    }
  }

  const parsed = siteSettingSchema.safeParse({ key, value });
  if (!parsed.success) {
    return { ok: false, error: `Invalid value for ${key} — check the format and try again.` };
  }
  return persistSetting(session, parsed.data);
}

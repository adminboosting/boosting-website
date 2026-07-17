import { z } from "zod";

/**
 * Zod schemas for the Phase-3 admin surfaces (booster assignment, coupon CRUD,
 * site settings). Pure module — no "server-only", no supabase imports — so
 * both client forms and server actions share one validation source.
 *
 * Write-path reminder (see 0002/0003 grants): coupons are managed through the
 * USER-SCOPED client (full DML grant + coupons_admin_all proves RLS), while
 * order_assignments and site_settings have SELECT-only authenticated grants —
 * their writes go through the service role. Don't "fix" that asymmetry here.
 */

/**
 * Server actions are network-callable RPC — every id argument is validated
 * before touching data. Exported so new actions stop re-declaring the local
 * UUID_RE in app/(admin)/admin/orders/actions.ts.
 */
export const uuidSchema = z.uuid();

/** Mirrors the `coupon_kind` enum (0001_foundation.sql). */
export const COUPON_KINDS = ["percent", "flat"] as const;

/**
 * A coupon create/edit payload. `code` is normalized to an uppercase slug
 * (2–32 chars, A–Z / 0–9 / dash / underscore) so lookups stay exact-match.
 * `amount` is basis points for `percent` and integer cents for `flat` — both
 * strictly positive ints (money is integer cents everywhere).
 */
export const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/, "2–32 chars: letters, digits, dash, underscore."),
  kind: z.enum(COUPON_KINDS),
  amount: z.coerce.number().int().positive(),
  minOrderCents: z.coerce.number().int().min(0).default(0),
  maxUses: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
  expiresAt: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.date().optional(),
  ),
  isActive: z.preprocess(
    // Checkbox semantics: present ("on"/"true"/true) is checked, absent is not.
    (v) => v === true || v === "on" || v === "true",
    z.boolean(),
  ),
});

/** Args for assignBooster(orderId, boosterId) — both must be real uuids. */
export const assignBoosterSchema = z.object({
  orderId: uuidSchema,
  boosterId: uuidSchema,
});

/** The known site_settings keys (seeded in supabase/seed.sql). */
export const SITE_SETTING_KEYS = [
  "brand_name",
  "support_email",
  "pricing_reviewed",
  "pricing_placeholder_note",
  "pricing_settings",
  "booster_availability",
] as const;

/**
 * A site_settings upsert, discriminated by key so each jsonb value is
 * validated per key — `pricing_reviewed` is strictly boolean, never truthy
 * strings. Unknown keys are rejected outright.
 */
export const siteSettingSchema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("pricing_reviewed"), value: z.boolean() }),
  z.object({ key: z.literal("brand_name"), value: z.string().trim().min(1).max(80) }),
  z.object({ key: z.literal("support_email"), value: z.email().max(254) }),
  z.object({ key: z.literal("pricing_placeholder_note"), value: z.string().trim().max(500) }),
  z.object({ key: z.literal("pricing_settings"), value: z.record(z.string(), z.unknown()) }),
  z.object({
    key: z.literal("booster_availability"),
    value: z.object({
      mode: z.enum(["manual", "live"]),
      counts: z.record(z.string(), z.number().int().min(0).max(9999)),
    }),
  }),
]);

export type CouponInput = z.infer<typeof couponSchema>;
export type AssignBoosterInput = z.infer<typeof assignBoosterSchema>;
export type SiteSettingInput = z.infer<typeof siteSettingSchema>;

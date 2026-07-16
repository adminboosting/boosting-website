"use server";

import { revalidatePath } from "next/cache";
import type { AdminActionState } from "@/app/(admin)/admin/orders/actions";
import { requireAdmin } from "@/lib/auth/session";
import { allMoneyPagePaths } from "@/lib/catalog/content";
import { couponSchema } from "@/lib/schemas/admin-ops";
import { createClient } from "@/lib/supabase/server";

/**
 * Coupon CRUD — deliberately the ONE admin surface that writes through the
 * USER-scoped client: coupons carries full DML grants for authenticated plus
 * the coupons_admin_all policy (0002), so these actions prove RLS end-to-end
 * instead of leaning on the service role (tests/db/admin-ops-rls.test.ts pins
 * the matrix). requireAdmin() is still layer 2; a forged call without the
 * admin role dies at the policy either way. Keep this surface on this path —
 * mirror-image of order_assignments/site_settings, which are service-role
 * because their grants are SELECT-only.
 */

/** Returned by saveCoupon via useActionState in components/admin/coupon-form.tsx. */
export interface CouponFormState {
  ok: boolean;
  error: string | null;
}

/**
 * The public money pages are SSG + 1h ISR (app/(marketing)/[game] and
 * [game]/[service] both export `revalidate = 3600`) — revalidate them after
 * every coupon change so the owner never waits out the window to see an edit
 * take. Quote math is always live (/api/quote is no-store); this refreshes the
 * prerendered pages that embed the calculator. Duplicated in
 * settings/actions.ts — a "use server" file may only export async functions,
 * so the helper can't be shared from either.
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

/**
 * Create or update a coupon (upsert on the code PK — the edit form keeps code
 * read-only, so an "edit" can never fork a new row by accident). `amount` is
 * basis points for percent coupons and integer cents for flat ones, exactly as
 * the pricing engine consumes them.
 */
export async function saveCoupon(
  _prev: CouponFormState,
  formData: FormData,
): Promise<CouponFormState> {
  // Identity first — outside any try/catch (redirect throws NEXT_REDIRECT).
  await requireAdmin();

  const parsed = couponSchema.safeParse({
    code: formData.get("code"),
    kind: formData.get("kind"),
    amount: formData.get("amount"),
    minOrderCents: formData.get("minOrderCents") ?? 0,
    maxUses: formData.get("maxUses") ?? "",
    expiresAt: formData.get("expiresAt") ?? "",
    isActive: formData.get("isActive") ?? false,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Check the form — code is 2–32 chars (A–Z, 0–9, dash, underscore) and amounts must be positive whole numbers.",
    };
  }
  const input = parsed.data;

  // camelCase schema → snake_case columns; `uses` is never written here (insert
  // defaults to 0, updates leave the counter alone).
  const supabase = await createClient();
  const { error } = await supabase.from("coupons").upsert(
    {
      code: input.code,
      kind: input.kind,
      amount: input.amount,
      min_order_cents: input.minOrderCents,
      max_uses: input.maxUses ?? null,
      expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
      is_active: input.isActive,
    },
    { onConflict: "code" },
  );
  if (error) {
    return { ok: false, error: "Couldn't save the coupon — refresh and try again." };
  }

  revalidatePath("/admin/coupons");
  revalidateMoneyPages();
  return { ok: true, error: null };
}

/** Activate/deactivate without touching the rest of the row. */
export async function setCouponActive(code: string, isActive: boolean): Promise<AdminActionState> {
  // Identity first — outside any try/catch (redirect throws NEXT_REDIRECT).
  await requireAdmin();

  const parsedCode = couponSchema.shape.code.safeParse(code);
  if (!parsedCode.success || typeof isActive !== "boolean") {
    return { ok: false, error: "Unknown coupon." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coupons")
    .update({ is_active: isActive })
    .eq("code", parsedCode.data)
    .select("code");
  if (error || !data || data.length === 0) {
    return { ok: false, error: "Coupon not found — refresh and try again." };
  }

  revalidatePath("/admin/coupons");
  revalidateMoneyPages();
  return { ok: true, error: null };
}

/**
 * Delete an UNUSED coupon. Once a coupon has uses (or an order references its
 * code via the orders.coupon_code FK), deletion is refused — deactivate
 * instead, so order history keeps resolving.
 */
export async function deleteCoupon(code: string): Promise<AdminActionState> {
  // Identity first — outside any try/catch (redirect throws NEXT_REDIRECT).
  await requireAdmin();

  const parsedCode = couponSchema.shape.code.safeParse(code);
  if (!parsedCode.success) {
    return { ok: false, error: "Unknown coupon." };
  }

  const supabase = await createClient();
  const { data: existingData } = await supabase
    .from("coupons")
    .select("code, uses")
    .eq("code", parsedCode.data)
    .maybeSingle();
  const existing = existingData as { code: string; uses: number } | null;
  if (!existing) return { ok: false, error: "Coupon not found." };
  if (existing.uses > 0) {
    return { ok: false, error: "This coupon has been used — deactivate it instead of deleting." };
  }

  // uses=0 predicate re-checks at delete time, so a concurrent checkout that
  // consumes the coupon turns this into a rejected no-op. A referencing order
  // without a counted use still trips the FK (23503) — same friendly answer.
  const { data: deleted, error } = await supabase
    .from("coupons")
    .delete()
    .eq("code", parsedCode.data)
    .eq("uses", 0)
    .select("code");
  if (error) {
    return { ok: false, error: "This coupon is attached to an order — deactivate it instead." };
  }
  if (!deleted || deleted.length === 0) {
    return { ok: false, error: "Couldn't delete the coupon — refresh and try again." };
  }

  revalidatePath("/admin/coupons");
  revalidateMoneyPages();
  return { ok: true, error: null };
}

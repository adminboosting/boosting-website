import type { Metadata } from "next";
import Link from "next/link";
import { deleteCoupon, setCouponActive } from "@/app/(admin)/admin/coupons/actions";
import { AdminActionButton } from "@/components/admin/admin-action-button";
import { CouponForm, type CouponFormValues } from "@/components/admin/coupon-form";
import { requireAdmin } from "@/lib/auth/session";
import { formatUsdFromCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin — coupons",
  description: "Coupon codes: create, edit, activate, and retire.",
  robots: { index: false },
};

/** The coupons columns, as PostgREST returns them (0002_catalog.sql). */
interface CouponRow {
  code: string;
  kind: "percent" | "flat";
  amount: number;
  min_order_cents: number;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  is_active: boolean;
}

/** Server-rendered dates; en-US to match the money formatter. */
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/** 1000bp percent coupon → "10%"; flat coupons are plain cents. */
function amountLabel(coupon: CouponRow): string {
  return coupon.kind === "percent"
    ? `${(coupon.amount / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`
    : formatUsdFromCents(coupon.amount);
}

export default async function AdminCouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  // Independent identity check on top of the layout's — layers hold alone.
  await requireAdmin();
  const { edit } = await searchParams;

  // USER-scoped client on purpose: coupons is the admin surface that proves
  // RLS (full DML grant + coupons_admin_all) instead of using the service
  // role. A non-admin reaching this query gets zero rows, not an error.
  const supabase = await createClient();
  const { data } = await supabase.from("coupons").select("*").order("code", { ascending: true });
  const coupons = (data ?? []) as CouponRow[];

  const editing = edit ? (coupons.find((c) => c.code === edit) ?? null) : null;
  const initial: CouponFormValues | null = editing
    ? {
        code: editing.code,
        kind: editing.kind,
        amount: editing.amount,
        minOrderCents: editing.min_order_cents,
        maxUses: editing.max_uses,
        // datetime-local wants "YYYY-MM-DDTHH:MM"; good enough for coupon
        // expiry granularity (stored value is timestamptz).
        expiresAt: editing.expires_at ? editing.expires_at.slice(0, 16) : null,
        isActive: editing.is_active,
      }
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Coupons</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Codes apply at the quote and checkout. Changes refresh the public pricing pages immediately.
      </p>

      <section className="mt-6 rounded-xl border border-border bg-card/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{editing ? `Edit ${editing.code}` : "Create a coupon"}</h2>
          {editing && (
            <Link
              href="/admin/coupons"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Cancel edit
            </Link>
          )}
        </div>
        <div className="mt-4">
          {/* Keyed so switching edit targets resets the uncontrolled inputs. */}
          <CouponForm key={editing?.code ?? "new"} initial={initial} />
        </div>
      </section>

      {coupons.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-card/40 p-8 text-center">
          <p className="text-sm text-muted-foreground">No coupons yet.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Discount</th>
                <th className="px-4 py-3 font-medium">Min order</th>
                <th className="px-4 py-3 font-medium">Uses</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {coupons.map((coupon) => (
                <tr key={coupon.code} className="transition-colors hover:bg-card/70">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/coupons?edit=${encodeURIComponent(coupon.code)}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {coupon.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {amountLabel(coupon)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {coupon.kind === "percent" ? "off" : "flat"}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {coupon.min_order_cents > 0 ? formatUsdFromCents(coupon.min_order_cents) : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {coupon.uses}
                    {coupon.max_uses !== null && ` / ${coupon.max_uses}`}
                  </td>
                  <td className="px-4 py-3">
                    {coupon.expires_at ? DATE_FORMAT.format(new Date(coupon.expires_at)) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                        coupon.is_active
                          ? "border-success/40 bg-success/10 text-success"
                          : "border-border bg-muted/40 text-muted-foreground",
                      )}
                    >
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                      {coupon.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <AdminActionButton
                        action={setCouponActive.bind(null, coupon.code, !coupon.is_active)}
                        label={coupon.is_active ? "Deactivate" : "Activate"}
                        variant="outline"
                      />
                      {/* The action refuses deletes once uses > 0 (order
                          history keeps resolving); hide the button then. */}
                      {coupon.uses === 0 && (
                        <AdminActionButton
                          action={deleteCoupon.bind(null, coupon.code)}
                          label="Delete"
                          variant="destructive"
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

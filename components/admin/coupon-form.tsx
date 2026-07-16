"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { saveCoupon, type CouponFormState } from "@/app/(admin)/admin/coupons/actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: CouponFormState = { ok: false, error: null };

/**
 * Initial values for edit mode, pre-mapped by the server page (camelCase like
 * couponSchema; expiresAt already sliced to datetime-local shape). Absent =
 * create mode.
 */
export interface CouponFormValues {
  code: string;
  kind: "percent" | "flat";
  amount: number;
  minOrderCents: number;
  maxUses: number | null;
  expiresAt: string | null;
  isActive: boolean;
}

/**
 * Create/edit coupon form over the saveCoupon action (user-scoped RLS write —
 * see coupons/actions.ts). Uncontrolled inputs with defaultValue, so the
 * server page keys this component by the edited code to reset between
 * targets. Code is read-only while editing: the PK is the upsert conflict
 * target, so changing it would fork a new coupon.
 */
export function CouponForm({ initial }: { initial?: CouponFormValues | null }) {
  const [state, formAction, pending] = useActionState(saveCoupon, INITIAL_STATE);
  const editing = Boolean(initial);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}
      {state.ok && (
        <div className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          <span>Coupon saved.</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Code</span>
          <input
            name="code"
            type="text"
            required
            minLength={2}
            maxLength={32}
            defaultValue={initial?.code ?? ""}
            readOnly={editing}
            autoComplete="off"
            placeholder="SUMMER25"
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm uppercase placeholder:normal-case placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring read-only:opacity-60"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Kind</span>
          <select
            name="kind"
            defaultValue={initial?.kind ?? "percent"}
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="percent">Percent of subtotal</option>
            <option value="flat">Flat amount off</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Amount</span>
          <input
            name="amount"
            type="number"
            required
            min={1}
            step={1}
            defaultValue={initial?.amount ?? ""}
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Percent: basis points (1000 = 10%). Flat: cents (500 = $5.00).
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Minimum order (cents)</span>
          <input
            name="minOrderCents"
            type="number"
            min={0}
            step={1}
            defaultValue={initial?.minOrderCents ?? 0}
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Max uses (optional)</span>
          <input
            name="maxUses"
            type="number"
            min={1}
            step={1}
            defaultValue={initial?.maxUses ?? ""}
            placeholder="Unlimited"
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Expires (optional)</span>
          <input
            name="expiresAt"
            type="datetime-local"
            defaultValue={initial?.expiresAt ?? ""}
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          name="isActive"
          type="checkbox"
          defaultChecked={initial?.isActive ?? true}
          className="size-4 rounded border-input accent-primary"
        />
        Active (customers can apply it at checkout)
      </label>

      <Button type="submit" size="sm" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {editing ? "Save changes" : "Create coupon"}
      </Button>
    </form>
  );
}

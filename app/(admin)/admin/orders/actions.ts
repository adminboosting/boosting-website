"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getLoyaltyTierForSpend } from "@/lib/catalog/data";
import { applyBp } from "@/lib/money";
import { assertTransition, OrderStatusError, type OrderStatus } from "@/lib/orders/transitions";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";

/**
 * Admin mutations for the manual payment flow. The proxy middleware only
 * redirects — each action re-verifies the admin role itself, and ALL writes go
 * through the service-role client because payments, order_progress,
 * loyalty_ledger, and audit_log have no authenticated write grants (0003–0006).
 */

/** Action result shape for useActionState in components/admin/admin-action-button.tsx. */
export interface AdminActionState {
  ok: boolean;
  error: string | null;
}

/** Mirrors the `payment_status` enum (supabase/migrations/0001_foundation.sql). */
type PaymentStatus = "created" | "pending" | "confirmed" | "failed" | "refunded";

/** Statuses an admin may move a payment TO — 'created' is insert-only. */
export type ManualPaymentTarget = Exclude<PaymentStatus, "created">;

/**
 * Manual payment walk — payment_status has NO DB state machine (0004), so this
 * map is the only enforcement. The lifecycle is created → pending →
 * confirmed/failed, with refunded only from confirmed; "pending" is an
 * optional bookkeeping stop, so confirming or failing straight from created is
 * allowed (skipping it changes nothing downstream). Settled payments never
 * move again except confirmed → refunded. The buttons in
 * app/(admin)/admin/orders/[id]/page.tsx mirror these pairs.
 */
const PAYMENT_STATUS_WALK: Record<PaymentStatus, readonly PaymentStatus[]> = {
  created: ["pending", "confirmed", "failed"],
  pending: ["confirmed", "failed"],
  confirmed: ["refunded"],
  failed: [],
  refunded: [],
};

/** Runtime guard for the nextStatus arg — TS types don't survive the wire. */
const MANUAL_PAYMENT_TARGETS: readonly string[] = ["pending", "confirmed", "failed", "refunded"];

/** Server actions are network-callable RPC — validate ids before touching data. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The payments columns the walk needs, as PostgREST returns them (snake_case). */
interface PaymentRow {
  id: string;
  order_id: string;
  amount_cents: number;
  status: PaymentStatus;
}

interface OrderRow {
  id: string;
  user_id: string;
  status: OrderStatus;
  subtotal_cents: number;
  discount_cents: number;
}

interface ProfileBalances {
  lifetime_spend_cents: number;
  store_credit_cents: number;
}

/** Both admin surfaces plus the customer's views of the same order. */
function revalidateOrderPaths(orderId: string): void {
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/account");
}

/**
 * Walk a manual payment to `nextStatus`. Confirming also moves the order to
 * 'paid' (via assertTransition — no DB state machine exists), writes the
 * customer-visible order_progress row, grows the customer's lifetime spend by
 * the amount paid, and credits loyalty cashback into store credit with a
 * ledger row. `note` (optional) is stored as the payment's provider_ref — the
 * manual reference an admin has, e.g. a crypto tx hash.
 */
export async function recordManualPayment(
  paymentId: string,
  nextStatus: ManualPaymentTarget,
  note?: string,
): Promise<AdminActionState> {
  // (1) Identity — independent of the proxy and the admin layout. redirect()
  // inside requireAdmin throws NEXT_REDIRECT, deliberately outside any try/catch.
  const session = await requireAdmin();

  // Every write below is service-role (no authenticated grants on these
  // tables) — refuse up front on a half-configured deploy rather than 500.
  if (!isServiceRoleConfigured()) {
    return { ok: false, error: "Payments can't be recorded on this deployment yet." };
  }

  // (2) Validate args — bound args arrive from the network, same as form data.
  if (typeof paymentId !== "string" || !UUID_RE.test(paymentId)) {
    return { ok: false, error: "Unknown payment." };
  }
  if (!MANUAL_PAYMENT_TARGETS.includes(nextStatus)) {
    return { ok: false, error: "Unknown payment status." };
  }
  const reference =
    typeof note === "string" && note.trim().length > 0 ? note.trim().slice(0, 200) : null;

  const admin = createAdminClient();

  // (3) Load the payment and its order. Reads use the service role too — the
  // admin role is already proven, and payments has no authenticated writes to
  // pair a scoped read with.
  const { data: paymentData } = await admin
    .from("payments")
    .select("id, order_id, amount_cents, status")
    .eq("id", paymentId)
    .maybeSingle();
  const payment = paymentData as PaymentRow | null;
  if (!payment) return { ok: false, error: "Payment not found." };

  // (4) Payment-status walk, in app code — the DB accepts any enum value.
  if (!PAYMENT_STATUS_WALK[payment.status].includes(nextStatus)) {
    return { ok: false, error: `A ${payment.status} payment can't be marked ${nextStatus}.` };
  }

  const { data: orderData } = await admin
    .from("orders")
    .select("id, user_id, status, subtotal_cents, discount_cents")
    .eq("id", payment.order_id)
    .maybeSingle();
  const order = orderData as OrderRow | null;
  if (!order) return { ok: false, error: "The payment's order no longer exists." };

  // (5) Confirming also moves the ORDER — validate that transition before any
  // write, so a blocked order leaves the payment untouched.
  if (nextStatus === "confirmed") {
    try {
      assertTransition(order.status, "paid");
    } catch (error) {
      if (error instanceof OrderStatusError) return { ok: false, error: error.message };
      throw error;
    }
  }

  // (6) Walk the payment. The status predicate makes a concurrent double-click
  // a rejected no-op instead of a double-confirm.
  const { data: walked, error: paymentError } = await admin
    .from("payments")
    .update({ status: nextStatus, ...(reference ? { provider_ref: reference } : {}) })
    .eq("id", payment.id)
    .eq("status", payment.status)
    .select("id");
  if (paymentError || !walked || walked.length === 0) {
    return { ok: false, error: "Couldn't update the payment — refresh and try again." };
  }

  if (nextStatus !== "confirmed") {
    // Best-effort audit trail; the walk stands even if this insert fails.
    await admin.from("audit_log").insert({
      actor_id: session.user.id,
      action: `payment.${nextStatus}`,
      entity: "payments",
      entity_id: payment.id,
      meta: { order_id: order.id, from: payment.status },
    });
    revalidateOrderPaths(order.id);
    return { ok: true, error: null };
  }

  // --- Confirmed: the order goes paid and the customer's loyalty moves. -----
  // supabase-js errors are non-throwing and the payment is already confirmed,
  // so failures below log loudly and degrade (same pattern as createOrder)
  // rather than pretend the confirmation didn't happen.
  const { data: moved, error: orderError } = await admin
    .from("orders")
    .update({ status: "paid" })
    .eq("id", order.id)
    .eq("status", order.status)
    .select("id");
  if (orderError || !moved || moved.length === 0) {
    console.error(
      `[admin] order ${order.id} did not move to paid after payment ${payment.id}:`,
      orderError?.message ?? "no row matched the expected status",
    );
    return {
      ok: false,
      error: "Payment confirmed, but the order didn't move to paid — check it manually.",
    };
  }

  // Customer-visible timeline row. order_progress inserts are staff-only by
  // policy (`order_progress_insert_staff`); written via the service role
  // anyway, with the acting admin as created_by.
  const { error: progressError } = await admin.from("order_progress").insert({
    order_id: order.id,
    status_from: order.status,
    status_to: "paid",
    note: "Manual payment confirmed",
    created_by: session.user.id,
  });
  if (progressError) {
    console.error(`[admin] progress insert failed for order ${order.id}:`, progressError.message);
  }

  // Loyalty: lifetime spend grows by what was actually paid; cashback lands as
  // store credit at the tier the customer held BEFORE this payment, computed
  // on the pre-credit total — the same formula as the quote's
  // cashbackPreviewCents (lib/pricing/engine.ts). No trigger maintains either
  // balance, so read + write happen together here; the read-then-write race is
  // acceptable at manual-confirmation volume.
  const { data: profileData } = await admin
    .from("profiles")
    .select("lifetime_spend_cents, store_credit_cents")
    .eq("id", order.user_id)
    .maybeSingle();
  const balances = profileData as ProfileBalances | null;
  let cashbackCents = 0;
  if (balances) {
    const tier = getLoyaltyTierForSpend(balances.lifetime_spend_cents);
    const preCreditTotal = Math.max(0, order.subtotal_cents - order.discount_cents);
    cashbackCents = applyBp(preCreditTotal, tier.cashbackBp);
    const balanceAfter = balances.store_credit_cents + cashbackCents;

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        lifetime_spend_cents: balances.lifetime_spend_cents + payment.amount_cents,
        store_credit_cents: balanceAfter,
      })
      .eq("id", order.user_id);
    if (profileError) {
      console.error(`[admin] loyalty update failed for order ${order.id}:`, profileError.message);
    } else if (cashbackCents > 0) {
      await admin.from("loyalty_ledger").insert({
        user_id: order.user_id,
        order_id: order.id,
        kind: "earn",
        amount_cents: cashbackCents,
        balance_after_cents: balanceAfter,
        note: `Cashback (${tier.name}) — manual payment confirmed`,
      });
    }
  } else {
    console.error(`[admin] no profile for order ${order.id} owner — loyalty skipped`);
  }

  // Best-effort audit trail; the confirmation stands even if this insert fails.
  await admin.from("audit_log").insert({
    actor_id: session.user.id,
    action: "payment.confirmed",
    entity: "payments",
    entity_id: payment.id,
    meta: { order_id: order.id, amount_cents: payment.amount_cents, cashback_cents: cashbackCents },
  });

  revalidateOrderPaths(order.id);
  return { ok: true, error: null };
}

/**
 * Cancel an order from any working status the seeded transition map allows
 * (pending_payment, paid, assigned, in_progress, paused). Store credit spent
 * at checkout is NOT auto-refunded — adjust the profile manually if owed.
 */
export async function cancelOrder(orderId: string): Promise<AdminActionState> {
  // Identity first — outside any try/catch (redirect throws NEXT_REDIRECT).
  const session = await requireAdmin();

  if (!isServiceRoleConfigured()) {
    return { ok: false, error: "Orders can't be managed on this deployment yet." };
  }
  if (typeof orderId !== "string" || !UUID_RE.test(orderId)) {
    return { ok: false, error: "Unknown order." };
  }

  const admin = createAdminClient();

  const { data } = await admin
    .from("orders")
    .select("id, user_id, status")
    .eq("id", orderId)
    .maybeSingle();
  const order = data as Pick<OrderRow, "id" | "user_id" | "status"> | null;
  if (!order) return { ok: false, error: "Order not found." };

  // App-side transition gate — completed/cancelled/refunded orders stay put.
  try {
    assertTransition(order.status, "cancelled");
  } catch (error) {
    if (error instanceof OrderStatusError) return { ok: false, error: error.message };
    throw error;
  }

  // Status predicate again: a concurrent status change turns this into a
  // rejected no-op instead of a silent overwrite.
  const { data: moved, error: orderError } = await admin
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", order.id)
    .eq("status", order.status)
    .select("id");
  if (orderError || !moved || moved.length === 0) {
    return { ok: false, error: "Couldn't cancel the order — refresh and try again." };
  }

  const { error: progressError } = await admin.from("order_progress").insert({
    order_id: order.id,
    status_from: order.status,
    status_to: "cancelled",
    note: "Cancelled by admin",
    created_by: session.user.id,
  });
  if (progressError) {
    console.error(`[admin] progress insert failed for order ${order.id}:`, progressError.message);
  }

  // Best-effort audit trail; the cancellation stands even if this insert fails.
  await admin.from("audit_log").insert({
    actor_id: session.user.id,
    action: "order.cancelled",
    entity: "orders",
    entity_id: order.id,
    meta: { from: order.status },
  });

  revalidateOrderPaths(order.id);
  return { ok: true, error: null };
}

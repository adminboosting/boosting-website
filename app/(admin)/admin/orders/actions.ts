"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SendMessageResult } from "@/components/chat/order-chat";
import { requireAdmin } from "@/lib/auth/session";
import { getLoyaltyTierForSpend } from "@/lib/catalog/data";
import { applyBp } from "@/lib/money";
import { assertTransition, OrderStatusError, type OrderStatus } from "@/lib/orders/transitions";
import type { ChatMessageRow } from "@/lib/realtime/order-chat-channel";
import { rewardReferralOnFirstPayment } from "@/lib/referrals/service";
import { assignBoosterSchema, uuidSchema } from "@/lib/schemas/admin-ops";
import { chatMessageSchema } from "@/lib/schemas/chat";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin mutations for the manual payment flow and the booster assignment
 * lifecycle. The proxy middleware only redirects — each action re-verifies the
 * admin role itself. Writes to payments, order_progress, loyalty_ledger,
 * audit_log, AND order_assignments go through the service-role client because
 * none of those tables has an authenticated write grant (0003–0006;
 * order_assignments is the grant-vs-policy trap — its admin FOR ALL policy is
 * unreachable through PostgREST on purpose). Chat inserts are the deliberate
 * exception: they use the USER-scoped client so RLS
 * (order_messages_insert_participants) stays the enforcement.
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
function isUuid(value: unknown): value is string {
  return uuidSchema.safeParse(value).success;
}

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
  if (!isUuid(paymentId)) {
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

    // Referral reward — fires only on the customer's FIRST confirmed payment,
    // gated on the PRE-bump lifetime_spend_cents read above (after the bump
    // it can never be 0 again, so re-reading here would never fire). Runs
    // after the profile update like the cashback credit; best-effort — the
    // referral row's own pending→rewarded status predicate keeps a retry or
    // concurrent confirm from double-paying.
    if (balances.lifetime_spend_cents === 0) {
      try {
        await rewardReferralOnFirstPayment(order.user_id, order.id);
      } catch (referralError) {
        console.error(`[admin] referral reward failed for order ${order.id}:`, referralError);
      }
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
  if (!isUuid(orderId)) {
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

// --- Booster assignment (Phase 3) -------------------------------------------

/**
 * Statuses an order may hold while gaining a booster. 'paid' walks to
 * 'assigned' via assertTransition; the in-flight trio re-covers an order whose
 * booster was unassigned WITHOUT moving status (there is no backward walk in
 * the seeded map). pending_payment and the terminal statuses are refused.
 */
const ASSIGNABLE_STATUSES: readonly OrderStatus[] = ["paid", "assigned", "in_progress", "paused"];

/** The profiles columns assignBooster verifies, plus the 1:1 booster embed. */
interface BoosterCandidateRow {
  id: string;
  role: "customer" | "booster" | "admin";
  booster_profiles: { is_accepting: boolean } | null;
}

/**
 * Assign a booster to an order. GRANT TRAP (0003): order_assignments has a
 * SELECT-only grant for authenticated — even an admin is grant-blocked from
 * PostgREST writes despite the order_assignments_write_admin policy, so every
 * write here is service-role. Do NOT "fix" this by widening grants; the
 * asymmetry is deliberate and regression-pinned by
 * tests/db/assignment-lifecycle.test.ts.
 */
export async function assignBooster(orderId: string, boosterId: string): Promise<AdminActionState> {
  // Identity first — outside any try/catch (redirect throws NEXT_REDIRECT).
  const session = await requireAdmin();

  if (!isServiceRoleConfigured()) {
    return { ok: false, error: "Boosters can't be assigned on this deployment yet." };
  }
  if (!assignBoosterSchema.safeParse({ orderId, boosterId }).success) {
    return { ok: false, error: "Unknown order or booster." };
  }

  const admin = createAdminClient();

  // Target must be a real booster who is accepting work — role alone isn't
  // enough (demotion flips is_accepting off but old links may still be open).
  const { data: boosterData } = await admin
    .from("profiles")
    .select("id, role, booster_profiles (is_accepting)")
    .eq("id", boosterId)
    .maybeSingle();
  const booster = boosterData as unknown as BoosterCandidateRow | null;
  if (!booster || booster.role !== "booster") {
    return { ok: false, error: "That user isn't a booster." };
  }
  if (!booster.booster_profiles?.is_accepting) {
    return { ok: false, error: "That booster isn't accepting new orders." };
  }

  const { data: orderData } = await admin
    .from("orders")
    .select("id, user_id, status")
    .eq("id", orderId)
    .maybeSingle();
  const order = orderData as Pick<OrderRow, "id" | "user_id" | "status"> | null;
  if (!order) return { ok: false, error: "Order not found." };

  if (!ASSIGNABLE_STATUSES.includes(order.status)) {
    return {
      ok: false,
      error:
        order.status === "pending_payment"
          ? "Confirm the payment before assigning a booster."
          : `A ${order.status} order can't take a booster.`,
    };
  }
  // Only the paid→assigned pair walks the status machine; validate it BEFORE
  // any write so a blocked order leaves the assignment untouched.
  if (order.status === "paid") {
    try {
      assertTransition(order.status, "assigned");
    } catch (error) {
      if (error instanceof OrderStatusError) return { ok: false, error: error.message };
      throw error;
    }
  }

  // The partial unique index order_assignments_one_active turns a concurrent
  // double-assign into a caught 23505 instead of two active boosters.
  const { error: insertError } = await admin
    .from("order_assignments")
    .insert({ order_id: order.id, booster_id: booster.id });
  if (insertError) {
    if (insertError.code === "23505") {
      return { ok: false, error: "This order already has an active booster — unassign first." };
    }
    return { ok: false, error: "Couldn't assign the booster — refresh and try again." };
  }

  // --- paid → assigned walk (re-assignments keep their current status) ------
  if (order.status === "paid") {
    const { data: moved, error: orderError } = await admin
      .from("orders")
      .update({ status: "assigned" })
      .eq("id", order.id)
      .eq("status", "paid")
      .select("id");
    if (orderError || !moved || moved.length === 0) {
      console.error(
        `[admin] order ${order.id} did not move to assigned:`,
        orderError?.message ?? "no row matched the expected status",
      );
      return {
        ok: false,
        error: "Booster assigned, but the order didn't move to assigned — check it manually.",
      };
    }

    const { error: progressError } = await admin.from("order_progress").insert({
      order_id: order.id,
      status_from: "paid",
      status_to: "assigned",
      note: "Booster assigned",
      created_by: session.user.id,
    });
    if (progressError) {
      console.error(`[admin] progress insert failed for order ${order.id}:`, progressError.message);
    }
  }

  // System chat notice — service-role ONLY: is_system must never ride an
  // authenticated insert (risk #2), so it never goes through the user client.
  const { error: messageError } = await admin.from("order_messages").insert({
    order_id: order.id,
    sender_id: null,
    body: "A booster has been assigned to this order.",
    is_system: true,
  });
  if (messageError) {
    console.error(`[admin] system message failed for order ${order.id}:`, messageError.message);
  }

  // Best-effort audit trail; the assignment stands even if this insert fails.
  await admin.from("audit_log").insert({
    actor_id: session.user.id,
    action: "order.assigned",
    entity: "orders",
    entity_id: order.id,
    meta: { booster_id: booster.id, from: order.status },
  });

  revalidateOrderPaths(order.id);
  revalidatePath("/booster");
  return { ok: true, error: null };
}

/**
 * Form adapter for the assignment card's `<select name="boosterId">` — plain
 * server-component form, so errors surface via a query param instead of
 * useActionState. Delegates every check to assignBooster.
 */
export async function assignBoosterFromForm(orderId: string, formData: FormData): Promise<void> {
  const boosterId = formData.get("boosterId");
  const result = await assignBooster(orderId, typeof boosterId === "string" ? boosterId : "");
  if (!result.ok) {
    redirect(
      `/admin/orders/${encodeURIComponent(orderId)}?assign_error=${encodeURIComponent(
        result.error ?? "Couldn't assign the booster.",
      )}`,
    );
  }
  redirect(`/admin/orders/${orderId}`);
}

/**
 * Release the active booster. The row is released, never deleted
 * (is_active=false + unassigned_at — there is no released_at column), and the
 * order KEEPS its current status: the seeded map has no backward walk, and a
 * re-assignment restores coverage. can_access_order() flips false for the
 * booster the moment this commits — their open pages go empty by design.
 */
export async function unassignBooster(orderId: string): Promise<AdminActionState> {
  // Identity first — outside any try/catch (redirect throws NEXT_REDIRECT).
  const session = await requireAdmin();

  if (!isServiceRoleConfigured()) {
    return { ok: false, error: "Boosters can't be managed on this deployment yet." };
  }
  if (!isUuid(orderId)) {
    return { ok: false, error: "Unknown order." };
  }

  const admin = createAdminClient();

  const { data: orderData } = await admin
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();
  const order = orderData as Pick<OrderRow, "id" | "status"> | null;
  if (!order) return { ok: false, error: "Order not found." };

  const { data: assignmentData } = await admin
    .from("order_assignments")
    .select("id, booster_id")
    .eq("order_id", order.id)
    .eq("is_active", true)
    .maybeSingle();
  const assignment = assignmentData as { id: string; booster_id: string } | null;
  if (!assignment) return { ok: false, error: "No active booster on this order." };

  // is_active predicate: a concurrent unassign becomes a rejected no-op.
  const { data: released, error: releaseError } = await admin
    .from("order_assignments")
    .update({ is_active: false, unassigned_at: new Date().toISOString() })
    .eq("id", assignment.id)
    .eq("is_active", true)
    .select("id");
  if (releaseError || !released || released.length === 0) {
    return { ok: false, error: "Couldn't unassign the booster — refresh and try again." };
  }

  // Timeline note without a status walk: status_from stays null so the
  // customer timeline renders a plain event, not a fake "X → X" transition.
  const { error: progressError } = await admin.from("order_progress").insert({
    order_id: order.id,
    status_from: null,
    status_to: order.status,
    note: "Booster unassigned",
    created_by: session.user.id,
  });
  if (progressError) {
    console.error(`[admin] progress insert failed for order ${order.id}:`, progressError.message);
  }

  // Best-effort audit trail; the release stands even if this insert fails.
  await admin.from("audit_log").insert({
    actor_id: session.user.id,
    action: "order.unassigned",
    entity: "orders",
    entity_id: order.id,
    meta: { booster_id: assignment.booster_id, status: order.status },
  });

  revalidateOrderPaths(order.id);
  revalidatePath("/booster");
  return { ok: true, error: null };
}

// --- In-context chat (Phase 3) ----------------------------------------------

/**
 * Send a chat message as the signed-in admin. Deliberately USER-scoped: the
 * insert must pass order_messages_insert_participants (can_access_order AND
 * sender_id = auth.uid() OR is_admin()) so RLS stays exercised — the admin
 * client here would hide policy regressions (risk #2). is_system is never
 * accepted from any client path; system notices are service-role code only
 * (see assignBooster). No revalidatePath — realtime owns the chat UI.
 */
export async function sendAdminOrderMessage(
  orderId: string,
  body: string,
): Promise<SendMessageResult> {
  // Identity first — outside any try/catch (redirect throws NEXT_REDIRECT).
  const session = await requireAdmin();

  if (!isUuid(orderId)) return { ok: false, error: "Unknown order." };
  const parsed = chatMessageSchema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: "Messages must be 1–2000 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_messages")
    .insert({ order_id: orderId, sender_id: session.user.id, body: parsed.data.body })
    .select("id, order_id, sender_id, body, is_system, created_at")
    .single();
  if (error || !data) return { ok: false, error: "Message could not be sent." };

  // The inserted row goes back for optimistic reconciliation (the realtime
  // event for our own message dedupes by id in mergeMessage).
  return { ok: true, error: null, message: data as ChatMessageRow };
}

/**
 * Mark messages read for the CURRENT admin. USER-scoped upsert — RLS
 * message_reads_own only ever writes rows for the caller, so a forged
 * message id can at worst mark the admin's own receipt. Capped at 100 ids to
 * match the chat history window. Fire-and-forget from the component; failures
 * just read as unread again.
 */
export async function markAdminMessagesRead(
  orderId: string,
  messageIds: string[],
): Promise<{ ok: boolean }> {
  // Identity first — outside any try/catch (redirect throws NEXT_REDIRECT).
  const session = await requireAdmin();

  if (!isUuid(orderId) || !Array.isArray(messageIds)) return { ok: false };
  const ids = messageIds.filter((id) => isUuid(id)).slice(0, 100);
  if (ids.length === 0) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.from("message_reads").upsert(
    ids.map((messageId) => ({ message_id: messageId, user_id: session.user.id })),
    { onConflict: "message_id,user_id", ignoreDuplicates: true },
  );
  return { ok: !error };
}

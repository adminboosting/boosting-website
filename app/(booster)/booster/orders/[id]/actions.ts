"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { SendMessageResult } from "@/components/chat/order-chat";
import type { NotifyResult } from "@/components/notifications/notify-button";
import { requireUser } from "@/lib/auth/session";
import { decryptCredentials, isVaultConfigured } from "@/lib/credentials/vault";
import { sendEmail } from "@/lib/email/send";
import { boosterMessageEmail } from "@/lib/email/templates";
import { createNotification } from "@/lib/notifications/create";
import { applyBp } from "@/lib/money";
import {
  assertTransition,
  canBoosterAdvance,
  OrderStatusError,
  type OrderStatus,
} from "@/lib/orders/transitions";
import { uuidSchema } from "@/lib/schemas/admin-ops";
import { chatMessageSchema, progressNoteSchema } from "@/lib/schemas/chat";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Booster mutations for an assigned order. Unlike the admin actions, the
 * status walk here goes ENTIRELY through the user-scoped client — RLS
 * (orders_update_owner_or_staff + order_progress_insert_staff, both riding
 * can_access_order) is exercised, never bypassed. But RLS is not the state
 * machine (risk #5: the update policy is column-unrestricted): every write is
 * gated by canBoosterAdvance + assertTransition and predicated on the expected
 * current status, so a stale tab or a double-click is a rejected no-op.
 *
 * The service role appears in exactly two places, both deliberate: completion
 * side-effects (booster_earnings has no authenticated INSERT grant; system
 * chat messages must never be client-authored — is_system is a service-role
 * code path only, risk #2) and the credential reveal (order_credentials is
 * deny-all to PostgREST by design).
 */

/** Action result shape for useActionState in components/booster/progress-controls.tsx. */
export interface BoosterActionState {
  ok: boolean;
  error: string | null;
}

/** What revealOrderCredentials returns — plaintext lives in memory once, client-side. */
export type RevealCredentialsResult =
  | { ok: true; username: string; password: string; note: string | null }
  | { ok: false; error: string };

/** Runtime guard for the nextStatus arg — TS types don't survive the wire. */
const BOOSTER_TARGETS: readonly string[] = ["in_progress", "paused", "completed"];

/**
 * Best-effort client IP for the credential_access_log trail. Vercel sets
 * x-forwarded-for; the first hop is the client. Null (local dev, exotic
 * proxies) is fine — the log column is nullable.
 */
async function clientIp(): Promise<string | null> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return headerList.get("x-real-ip");
}

/**
 * Prove the caller holds the ACTIVE assignment on this order, through the
 * user-scoped client (order_assignments_select shows a booster their own
 * rows). Every action re-runs this — bound args arrive from the network, and
 * an assignment can be revoked between page render and click (risk #6).
 */
async function verifyOwnActiveAssignment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("order_assignments")
    .select("id")
    .eq("order_id", orderId)
    .eq("booster_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Walk the order one booster-legal step (start / pause / resume / complete).
 * Bound by the form as `advanceOrderStatus.bind(null, orderId, nextStatus)`;
 * the optional progress note rides in the form data.
 *
 * Both writes go through the user-scoped client: the orders UPDATE passes
 * orders_update_owner_or_staff and is predicated on the expected from-status
 * (concurrent double-advance matches zero rows), then the order_progress
 * INSERT exercises order_progress_insert_staff. Completion side-effects
 * (earnings + system message) are best-effort service-role extras.
 */
export async function advanceOrderStatus(
  orderId: string,
  nextStatus: OrderStatus,
  _prev: BoosterActionState,
  formData: FormData,
): Promise<BoosterActionState> {
  // (1) Identity — independent of the layout. redirect() inside requireUser
  // throws NEXT_REDIRECT, deliberately outside any try/catch.
  const user = await requireUser();

  // (2) Validate args — bound args arrive from the network, same as form data.
  if (typeof orderId !== "string" || !uuidSchema.safeParse(orderId).success) {
    return { ok: false, error: "Unknown order." };
  }
  if (typeof nextStatus !== "string" || !BOOSTER_TARGETS.includes(nextStatus)) {
    return { ok: false, error: "That status change isn't available from here." };
  }
  const noteRaw = formData.get("note");
  const parsedNote = progressNoteSchema.safeParse({
    note: typeof noteRaw === "string" ? noteRaw : undefined,
  });
  if (!parsedNote.success) {
    return { ok: false, error: "Notes are limited to 500 characters." };
  }

  // (3) User-scoped read of the order (RLS can_access_order gates visibility)
  // plus the explicit own-active-assignment check — visibility alone is not
  // authorization (admins also pass can_access_order, and they have their own
  // surface; the booster walk belongs to the assigned booster only).
  const supabase = await createClient();
  const { data: orderData } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();
  const order = orderData as { id: string; status: OrderStatus } | null;
  if (!order) return { ok: false, error: "Order not found." };

  if (!(await verifyOwnActiveAssignment(supabase, orderId, user.id))) {
    return { ok: false, error: "You're not assigned to this order." };
  }

  // (4) The booster subset gate, then the full transition walk — RLS would
  // happily let any participant write any status (risk #5), so this pair plus
  // the status predicate below IS the state machine.
  if (!canBoosterAdvance(order.status, nextStatus)) {
    return { ok: false, error: `A ${order.status.replace("_", " ")} order can't move there.` };
  }
  try {
    assertTransition(order.status, nextStatus);
  } catch (error) {
    if (error instanceof OrderStatusError) return { ok: false, error: error.message };
    throw error;
  }

  // (5) Status-predicated update through RLS. completed_at feeds the
  // credential retention purge (lib/credentials/store.ts) — set it on the
  // completing write so retention counts from the real finish time.
  const { data: moved, error: moveError } = await supabase
    .from("orders")
    .update({
      status: nextStatus,
      ...(nextStatus === "completed" ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", order.id)
    .eq("status", order.status)
    .select("id");
  if (moveError || !moved || moved.length === 0) {
    return { ok: false, error: "Couldn't update the order — refresh and try again." };
  }

  // Customer-visible timeline row, through order_progress_insert_staff (the
  // caller's active assignment satisfies the policy). Best-effort: the status
  // already moved, so a failure here logs loudly rather than pretending the
  // advance didn't happen (same posture as the admin actions).
  const { error: progressError } = await supabase.from("order_progress").insert({
    order_id: order.id,
    status_from: order.status,
    status_to: nextStatus,
    note: parsedNote.data.note ?? null,
    created_by: user.id,
  });
  if (progressError) {
    console.error(`[booster] progress insert failed for order ${order.id}:`, progressError.message);
  }

  if (nextStatus === "completed") {
    await recordCompletionExtras(order.id, user.id);
  }

  revalidatePath(`/booster/orders/${order.id}`);
  revalidatePath("/booster");
  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/account");
  return { ok: true, error: null };
}

/**
 * Completion side-effects, service-role only: booster_earnings has no
 * authenticated INSERT grant, and system chat messages (is_system: true,
 * sender_id: null) must never travel through a client-scoped insert (risk #2).
 * Best-effort by design — the completion itself already stands; a
 * half-configured deploy skips both with a console.warn instead of failing.
 * The money read (total_cents) happens HERE, server-side under the service
 * role — booster pages never select money columns.
 */
async function recordCompletionExtras(orderId: string, boosterId: string): Promise<void> {
  if (!isServiceRoleConfigured()) {
    console.warn(
      `[booster] service role not configured — earnings + system message skipped for order ${orderId}`,
    );
    return;
  }
  const admin = createAdminClient();

  const [{ data: orderData }, { data: boosterData }] = await Promise.all([
    admin.from("orders").select("total_cents").eq("id", orderId).maybeSingle(),
    admin.from("booster_profiles").select("cut_bp").eq("id", boosterId).maybeSingle(),
  ]);
  const totals = orderData as { total_cents: number } | null;
  const boosterProfile = boosterData as { cut_bp: number } | null;

  if (totals && boosterProfile) {
    const { error: earningsError } = await admin.from("booster_earnings").insert({
      booster_id: boosterId,
      order_id: orderId,
      amount_cents: applyBp(totals.total_cents, boosterProfile.cut_bp),
    });
    if (earningsError) {
      console.error(
        `[booster] earnings insert failed for order ${orderId}:`,
        earningsError.message,
      );
    }
  } else {
    console.warn(
      `[booster] earnings skipped for order ${orderId} — missing ${totals ? "booster_profiles row" : "order"}`,
    );
  }

  const { error: messageError } = await admin.from("order_messages").insert({
    order_id: orderId,
    sender_id: null,
    body: "Your boost is complete. Thanks for choosing RankedFrogs — you can leave a review from the order page.",
    is_system: true,
  });
  if (messageError) {
    console.error(
      `[booster] system message insert failed for order ${orderId}:`,
      messageError.message,
    );
  }
}

/**
 * Reveal the customer's piloted-account login to the assigned booster.
 * order_credentials is deny-all to PostgREST by design, so the envelope is
 * read through the service role — but only AFTER the caller's active
 * assignment is proven through the user-scoped client (never trust the bound
 * arg). The credential_access_log row is written BEFORE any plaintext leaves
 * this function, and a log failure aborts the reveal — an unlogged reveal
 * must be impossible. The plaintext is returned once for an in-memory render
 * (components/booster/credential-reveal.tsx); nothing is revalidated or
 * cached.
 */
export async function revealOrderCredentials(orderId: string): Promise<RevealCredentialsResult> {
  // Identity first — outside any try/catch (redirect throws NEXT_REDIRECT).
  const user = await requireUser();

  if (typeof orderId !== "string" || !uuidSchema.safeParse(orderId).success) {
    return { ok: false, error: "Unknown order." };
  }

  const supabase = await createClient();
  if (!(await verifyOwnActiveAssignment(supabase, orderId, user.id))) {
    return { ok: false, error: "You're not assigned to this order." };
  }

  // Graceful degradation on a half-configured deploy — the component shows
  // this message verbatim.
  if (!isServiceRoleConfigured() || !isVaultConfigured()) {
    return { ok: false, error: "Credential access is not configured on this deployment." };
  }

  const admin = createAdminClient();
  const { data: credentialData } = await admin
    .from("order_credentials")
    .select("id, ciphertext, iv, auth_tag")
    .eq("order_id", orderId)
    .is("deleted_at", null)
    .maybeSingle();
  const credential = credentialData as {
    id: string;
    ciphertext: string;
    iv: string;
    auth_tag: string;
  } | null;
  if (!credential) {
    return { ok: false, error: "No credentials on file for this order." };
  }

  // Log BEFORE decrypt/return. If this insert fails, the reveal is aborted —
  // the row records the attempt even when the decrypt below then fails, which
  // is the conservative direction for an access trail.
  const { error: logError } = await admin.from("credential_access_log").insert({
    order_id: orderId,
    credential_id: credential.id,
    accessed_by: user.id,
    action: "reveal",
    ip: await clientIp(),
  });
  if (logError) {
    console.error(`[booster] reveal log insert failed for order ${orderId}:`, logError.message);
    return { ok: false, error: "Couldn't record the access log — reveal cancelled." };
  }

  try {
    const plaintext = decryptCredentials({
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.auth_tag,
    });
    const payload = JSON.parse(plaintext) as {
      username?: unknown;
      password?: unknown;
      note?: unknown;
    };
    if (typeof payload.username !== "string" || typeof payload.password !== "string") {
      return { ok: false, error: "Stored credentials are malformed — ask the customer to resubmit." };
    }
    return {
      ok: true,
      username: payload.username,
      password: payload.password,
      note: typeof payload.note === "string" ? payload.note : null,
    };
  } catch {
    // GCM auth failure / corrupt envelope. Never log the error payload here —
    // it could carry partial plaintext buffers.
    return { ok: false, error: "Stored credentials could not be decrypted — ask the customer to resubmit." };
  }
}

/** Ignore repeat customer notifications for the same order inside this window (seconds). */
const CUSTOMER_NOTIFY_COOLDOWN_S = 60;

/**
 * Booster → customer notification ("Notify customer"). Unlike the customer's
 * live ping, the customer is NOT expected to have the site open, so the primary
 * channel is EMAIL (from @rankedfrogs.com via Resend) — an in-app notification
 * is also dropped so an online customer gets the popup too.
 *
 * The active-assignment check is the authorization (verifyOwnActiveAssignment,
 * user-scoped). The customer's email is read through the SERVICE ROLE:
 * profiles_select_self_or_admin does not let a booster read the customer's
 * profile, and boosters never see customer PII in the UI — so the address is
 * fetched server-side and never returned to the client. The email body is
 * content-free (just "you have a message, open your order") because the chat
 * thread can contain account details.
 */
export async function notifyCustomer(orderId: string): Promise<NotifyResult> {
  const user = await requireUser();

  if (typeof orderId !== "string" || !uuidSchema.safeParse(orderId).success) {
    return { ok: false, error: "Unknown order." };
  }

  const supabase = await createClient();
  if (!(await verifyOwnActiveAssignment(supabase, orderId, user.id))) {
    return { ok: false, error: "You're not assigned to this order." };
  }

  // Customer address + name via the service role (boosters can't read the
  // customer's profile under RLS, and must not — this stays server-side).
  if (!isServiceRoleConfigured()) {
    return { ok: false, error: "Notifications aren't configured on this deployment." };
  }
  const admin = createAdminClient();
  const { data: orderData } = await admin
    .from("orders")
    .select("user_id, profiles!orders_user_id_fkey (email, display_name)")
    .eq("id", orderId)
    .maybeSingle();
  const owner = orderData as {
    user_id: string;
    profiles: { email: string | null; display_name: string | null } | null;
  } | null;
  if (!owner) return { ok: false, error: "Order not found." };

  // In-app ping so an online customer also sees the popup (best-effort).
  await createNotification({
    recipientId: owner.user_id,
    actorId: user.id,
    orderId,
    kind: "customer_message",
    title: "Message from your booster",
    body: `Your booster on order #${orderId.slice(0, 8)} sent you a message — open the order to read it.`,
    cooldownSeconds: CUSTOMER_NOTIFY_COOLDOWN_S,
  });

  // Email is the reliable channel — the customer may be offline.
  const email = owner.profiles?.email;
  if (!email) {
    // No address on file: the in-app ping above is the only delivery. Treat as
    // success so the booster isn't stuck (nothing more they can do).
    return { ok: true, delivered: false };
  }
  const sent = await sendEmail(
    boosterMessageEmail({ to: email, orderId, displayName: owner.profiles?.display_name }),
  );
  if (!sent.ok) return { ok: false, error: "Couldn't email the customer — try again shortly." };
  return { ok: true, delivered: true };
}

/**
 * Chat send for the booster surface. Deliberately duplicates the shape of the
 * customer wrapper (Agent A's shop actions) instead of importing it — the two
 * surfaces keep disjoint action files. Insert goes through the USER-SCOPED
 * client with sender_id: user.id explicitly, so
 * order_messages_insert_participants is the enforcement (risk #2: never the
 * admin client, never client-supplied is_system). Returns the inserted row
 * for optimistic reconciliation; no revalidatePath — realtime owns the UI.
 */
export async function sendBoosterMessage(
  orderId: string,
  body: string,
): Promise<SendMessageResult> {
  const user = await requireUser();

  if (typeof orderId !== "string" || !uuidSchema.safeParse(orderId).success) {
    return { ok: false, error: "Unknown order." };
  }
  const parsed = chatMessageSchema.safeParse({ body });
  if (!parsed.success) {
    return { ok: false, error: "Messages must be 1–2000 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_messages")
    .insert({ order_id: orderId, sender_id: user.id, body: parsed.data.body })
    .select("id, order_id, sender_id, body, is_system, created_at")
    .single();

  if (error || !data) {
    // RLS rejection reads the same as a revoked assignment (risk #6) — one
    // calm message either way.
    return { ok: false, error: "Could not send — you may no longer be assigned to this order." };
  }
  return { ok: true, error: null, message: data as SendMessageResult["message"] };
}

/**
 * Mark messages read for the CURRENT user (batched, fire-and-forget from the
 * chat component). RLS message_reads_own is the gate — the upsert can only
 * ever write rows for the caller. Capped at 100 ids; non-uuid ids are dropped
 * rather than erroring (temp- optimistic ids never reach here anyway).
 */
export async function markBoosterMessagesRead(
  orderId: string,
  messageIds: string[],
): Promise<{ ok: boolean }> {
  const user = await requireUser();

  if (typeof orderId !== "string" || !uuidSchema.safeParse(orderId).success) {
    return { ok: false };
  }
  const ids = (Array.isArray(messageIds) ? messageIds : [])
    .filter((id) => typeof id === "string" && uuidSchema.safeParse(id).success)
    .slice(0, 100);
  if (ids.length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("message_reads")
    .upsert(
      ids.map((message_id) => ({ message_id, user_id: user.id })),
      { onConflict: "message_id,user_id", ignoreDuplicates: true },
    );
  return { ok: !error };
}

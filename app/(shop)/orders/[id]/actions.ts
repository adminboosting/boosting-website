"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { SendMessageResult } from "@/components/chat/order-chat";
import type { NotifyResult } from "@/components/notifications/notify-button";
import { requireUser } from "@/lib/auth/session";
import { storeOrderCredentials } from "@/lib/credentials/store";
import { createNotification } from "@/lib/notifications/create";
import type { ChatMessageRow } from "@/lib/realtime/order-chat-channel";
import { uuidSchema } from "@/lib/schemas/admin-ops";
import { credentialSubmissionSchema } from "@/lib/schemas/auth";
import { chatMessageSchema, reviewSchema } from "@/lib/schemas/chat";
import { createClient } from "@/lib/supabase/server";

/**
 * Customer-facing order actions: credential submission (Phase 2), plus chat,
 * read receipts, and the completed-order review (Phase 3). Every action
 * authenticates the caller itself (the proxy only redirects) and validates its
 * inputs — bound args arrive from the network, same as form data. The chat and
 * review writes go through the USER-SCOPED client on purpose: RLS
 * (`order_messages_insert_participants`, `message_reads_own`,
 * `reviews_insert_own_completed`) is the enforcement layer being exercised,
 * never the service role.
 *
 * Credential submission hands off to storeOrderCredentials — which re-verifies
 * ownership, piloted mode, and paid-state through the service role, encrypts
 * before anything touches the database, and returns a typed "not configured"
 * error instead of ever accepting plaintext on a mis-deployed env. Plaintext
 * credentials exist only between the FormData parse and the vault's encrypt
 * call frame; nothing here logs them.
 */

/** Returned by submitCredentials via useActionState. */
export interface SubmitCredentialsState {
  ok: boolean;
  error: string | null;
}

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
 * Bound by the form as `submitCredentials.bind(null, orderId)` — orderId is
 * client-controlled either way, so ownership is proven server-side in
 * storeOrderCredentials, never assumed from the binding.
 */
export async function submitCredentials(
  orderId: string,
  _prev: SubmitCredentialsState,
  formData: FormData,
): Promise<SubmitCredentialsState> {
  // Independent identity check (spec A2 layer 2). requireUser() redirects via
  // NEXT_REDIRECT when signed out — deliberately outside any try/catch.
  const user = await requireUser();

  // Blank/whitespace note collapses to undefined so the encrypted payload
  // never carries an empty field (same posture as signUp's displayName).
  const noteRaw = formData.get("note");
  const parsed = credentialSubmissionSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    note: typeof noteRaw === "string" && noteRaw.trim() ? noteRaw : undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter your account username and password." };
  }

  // Re-verifies order exists + belongs to this user + piloted + accepting
  // statuses, encrypts, upserts, and logs — or degrades with a typed error
  // (code "not_configured" covers a missing vault key or service role).
  const result = await storeOrderCredentials(orderId, user.id, parsed.data, await clientIp());
  if (!result.ok) return { ok: false, error: result.error };

  // The order page checks credential existence server-side — refresh it so a
  // reload shows the "credentials received" note instead of the form.
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, error: null };
}

/**
 * Send a chat message on an order. Bound by the page as
 * `sendOrderMessage.bind(null, order.id)` — but the USER-SCOPED insert is the
 * proof of participation, not the binding: `order_messages_insert_participants`
 * requires `can_access_order(order_id) AND sender_id = auth.uid()`, so
 * `sender_id` is set explicitly to the verified user (no DB default exists)
 * and a non-participant's insert dies at the policy. `is_system` is never
 * accepted from any client — system messages are service-role code paths only
 * (risk #2). No revalidatePath: realtime (or the component's polling fallback)
 * owns the chat UI, and the returned row is what reconciles the optimistic
 * temp message.
 */
export async function sendOrderMessage(orderId: string, body: string): Promise<SendMessageResult> {
  // Independent identity check (spec A2 layer 2) — redirect() throws
  // NEXT_REDIRECT, deliberately outside any try/catch.
  const user = await requireUser();

  if (!uuidSchema.safeParse(orderId).success) {
    return { ok: false, error: "Unknown order." };
  }
  // The DB has NO length CHECK on order_messages.body — this parse is the limit.
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
    // RLS rejection and a vanished order look identical on purpose — don't
    // leak which orders exist to non-participants.
    return { ok: false, error: "Message could not be sent — refresh and try again." };
  }
  return { ok: true, error: null, message: data as ChatMessageRow };
}

/** Batched read receipts stay bounded — the chat only ever shows the last 100. */
const MARK_READ_CAP = 100;

/**
 * Mark messages read for the CURRENT user (fire-and-forget from the chat
 * component). User-scoped upsert: `message_reads_own` pins `user_id =
 * auth.uid()`, so nobody can write another user's receipts no matter what ids
 * arrive. `ignoreDuplicates` makes re-marking free — the component re-marks
 * initial history on every mount rather than shipping read state down.
 * Failures are non-fatal by design (the ids simply read as unread next load),
 * hence the bare `{ ok }` result.
 */
export async function markMessagesRead(
  orderId: string,
  messageIds: string[],
): Promise<{ ok: boolean }> {
  const user = await requireUser();

  if (!uuidSchema.safeParse(orderId).success || !Array.isArray(messageIds)) {
    return { ok: false };
  }
  const ids = [...new Set(messageIds)]
    .filter((id): id is string => uuidSchema.safeParse(id).success)
    .slice(0, MARK_READ_CAP);
  if (ids.length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("message_reads").upsert(
    ids.map((message_id) => ({ message_id, user_id: user.id })),
    { onConflict: "message_id,user_id", ignoreDuplicates: true },
  );
  return { ok: !error };
}

/** Ignore repeat pings for the same booster+order inside this window (seconds). */
const BOOSTER_PING_COOLDOWN_S = 30;

/**
 * Customer → booster live ping ("Notify booster"). The customer owns the order;
 * the ping lands as a Realtime INSERT the booster's per-user channel turns into
 * an audio chime + popup (they're expected to keep the site open).
 *
 * Authorization is proven through the USER-SCOPED client — RLS
 * `orders_select_participants` and `order_assignments_select` only return the
 * order + its active assignment to a participant, so a non-owner reads null and
 * gets a calm "unavailable". The actual INSERT is service-role
 * (createNotification): notifications has no authenticated INSERT grant, so a
 * customer can never forge a ping — they can only trigger this vetted path.
 */
export async function notifyBooster(orderId: string): Promise<NotifyResult> {
  const user = await requireUser();

  if (!uuidSchema.safeParse(orderId).success) {
    return { ok: false, error: "Unknown order." };
  }

  const supabase = await createClient();
  // Ownership: the ping is the customer's action, so require the order be
  // theirs (can_access_order also passes assigned boosters/admins — this call
  // belongs to the owner). A row they can't see reads as null.
  const { data: orderData } = await supabase
    .from("orders")
    .select("id, user_id")
    .eq("id", orderId)
    .maybeSingle();
  const order = orderData as { id: string; user_id: string } | null;
  if (!order || order.user_id !== user.id) {
    return { ok: false, error: "Order not found." };
  }

  // The active booster to ping. order_assignments_select returns this row to
  // the owner via can_access_order.
  const { data: assignmentData } = await supabase
    .from("order_assignments")
    .select("booster_id")
    .eq("order_id", orderId)
    .eq("is_active", true)
    .maybeSingle();
  const assignment = assignmentData as { booster_id: string } | null;
  if (!assignment) {
    return { ok: false, error: "No booster is assigned to this order yet." };
  }

  const result = await createNotification({
    recipientId: assignment.booster_id,
    actorId: user.id,
    orderId,
    kind: "booster_ping",
    title: "A customer is waiting",
    body: `The customer on order #${orderId.slice(0, 8)} pinged you — open the order to respond.`,
    cooldownSeconds: BOOSTER_PING_COOLDOWN_S,
  });
  if (!result.ok) return { ok: false, error: "Couldn't notify your booster — try again shortly." };
  // Cooldown / degraded still reads as success to the customer (the booster was
  // already pinged moments ago, or in-app delivery isn't configured).
  return { ok: true, delivered: result.delivered };
}

/** Returned by submitReview via useActionState. */
export interface SubmitReviewState {
  ok: boolean;
  error: string | null;
}

/**
 * Review a completed order. `is_published: false` is HARDCODED — publishing is
 * moderation, enforced twice over (0007's WITH CHECK and this action never
 * reading the flag from the client). Ownership + completed-status are proven
 * by RLS `reviews_insert_own_completed` through the user-scoped client; the
 * UNIQUE(order_id) constraint maps to a friendly "already reviewed".
 */
export async function submitReview(
  orderId: string,
  _prev: SubmitReviewState,
  formData: FormData,
): Promise<SubmitReviewState> {
  // Identity first — outside any try/catch (redirect throws NEXT_REDIRECT).
  const user = await requireUser();

  if (!uuidSchema.safeParse(orderId).success) {
    return { ok: false, error: "Unknown order." };
  }
  const parsed = reviewSchema.safeParse({
    rating: formData.get("rating"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Pick a rating from 1 to 5 stars." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reviews").insert({
    order_id: orderId,
    user_id: user.id,
    rating: parsed.data.rating,
    body: parsed.data.body ?? null,
    is_published: false,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "You already reviewed this order." };
    }
    // RLS rejection (not yours / not completed) and a vanished order look the same.
    return { ok: false, error: "Reviews open once an order is completed." };
  }

  // The page renders the submitted review server-side on next load.
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, error: null };
}

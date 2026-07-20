import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";

/**
 * Service-role insert of a `notifications` row. Lives here (not inline in the
 * actions) because BOTH order surfaces create notifications and the table has
 * no authenticated INSERT grant by design (0010) — a client must never be able
 * to forge a ping to another user. The CALLER is responsible for proving the
 * sender is entitled to notify the recipient about the order; this helper only
 * writes, applies the anti-spam cooldown, and degrades cleanly.
 */

export type NotificationKind = "booster_ping" | "customer_message";

export interface CreateNotificationInput {
  recipientId: string;
  actorId: string | null;
  orderId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /**
   * Suppress the insert when an identical (recipient, order, kind) row already
   * exists within this many seconds. Stops a mashed button from spamming the
   * recipient. Omit/0 to always insert.
   */
  cooldownSeconds?: number;
}

export type CreateNotificationResult =
  | { ok: true; delivered: true }
  | { ok: true; delivered: false; reason: "cooldown" | "not_configured" }
  | { ok: false; error: string };

export async function createNotification(
  input: CreateNotificationInput,
): Promise<CreateNotificationResult> {
  if (!isServiceRoleConfigured()) {
    // In-app delivery is best-effort; the caller (e.g. the email path) still
    // succeeds. Never a 500 on a half-configured deploy.
    return { ok: true, delivered: false, reason: "not_configured" };
  }

  const admin = createAdminClient();

  if (input.cooldownSeconds && input.cooldownSeconds > 0) {
    const since = new Date(Date.now() - input.cooldownSeconds * 1000).toISOString();
    const { data: recent } = await admin
      .from("notifications")
      .select("id")
      .eq("recipient_id", input.recipientId)
      .eq("order_id", input.orderId)
      .eq("kind", input.kind)
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();
    if (recent) return { ok: true, delivered: false, reason: "cooldown" };
  }

  const { error } = await admin.from("notifications").insert({
    recipient_id: input.recipientId,
    actor_id: input.actorId,
    order_id: input.orderId,
    kind: input.kind,
    title: input.title,
    body: input.body,
  });
  if (error) {
    console.error(`[notifications] insert failed (${input.kind}):`, error.message);
    return { ok: false, error: "Notification could not be delivered." };
  }
  return { ok: true, delivered: true };
}

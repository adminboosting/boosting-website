import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Per-user notifications realtime helpers. Isomorphic and dependency-injected
 * for the same reasons as lib/realtime/order-chat-channel.ts: no "server-only",
 * no client construction, no imports beyond supabase-js TYPES — so the
 * "use client" listener uses it against the browser client while the fast unit
 * suite exercises the exact wiring with a hand-rolled stub and zero env.
 *
 * Security model: `postgres_changes` payloads are RLS-filtered per subscriber
 * (0010 adds the table to the publication; notifications_select_own gates
 * delivery to recipient_id = auth.uid()). The `recipient_id=eq.<self>` filter
 * below is therefore a convenience to avoid waking the client for rows it would
 * be denied anyway — never the security boundary.
 */

/** A `notifications` row as PostgREST/Realtime return it (snake_case). */
export interface NotificationRow {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  order_id: string | null;
  kind: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

/** The two members of SupabaseClient this module touches (kept structural). */
export interface NotificationsRealtimeClient {
  channel(name: string): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): Promise<unknown>;
}

/** One channel per signed-in user (free-tier connection budget). */
export function notificationsChannelName(userId: string): string {
  return `notifications:${userId}`;
}

/**
 * The `postgres_changes` filter string. Exactness matters — a typo does not
 * error, it silently kills delivery — so it is pinned by a unit test.
 */
export function notificationFilter(userId: string): string {
  return `recipient_id=eq.${userId}`;
}

/**
 * Subscribe to notifications addressed to this user. Returns an unsubscribe
 * function (call it on unmount — leaked channels count against the
 * 200-connection free-tier cap). `onStatus` surfaces the channel lifecycle so
 * the caller can tell "connected" from "publication not applied yet".
 */
export function subscribeToNotifications(
  client: NotificationsRealtimeClient,
  userId: string,
  onInsert: (notification: NotificationRow) => void,
  onStatus?: (status: string) => void,
): () => void {
  const channel = client.channel(notificationsChannelName(userId));
  channel
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: notificationFilter(userId),
      },
      (payload: { new: NotificationRow }) => onInsert(payload.new),
    )
    .subscribe((status: string) => onStatus?.(status));
  return () => {
    void client.removeChannel(channel);
  };
}

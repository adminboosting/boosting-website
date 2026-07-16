import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Order-chat realtime helpers. Isomorphic and dependency-injected on purpose:
 * no "server-only", no client construction, no imports beyond supabase-js
 * TYPES — so the "use client" chat component can use it against the browser
 * client while the fast unit suite exercises the exact same wiring with a
 * hand-rolled stub (tests/unit/order-chat-channel.test.ts) and zero env.
 *
 * Security model: `postgres_changes` payloads are RLS-filtered per subscriber
 * (0007 adds the tables to the publication; 0003's can_access_order() policies
 * gate delivery). A revoked booster's channel therefore simply goes silent —
 * there is nothing to revoke client-side.
 */

/** An `order_messages` row as PostgREST/Realtime return it (snake_case). */
export interface ChatMessageRow {
  id: string;
  order_id: string;
  sender_id: string | null;
  body: string;
  is_system: boolean;
  created_at: string;
}

/**
 * The two members of SupabaseClient this module touches. Kept structural so
 * tests can stub it without constructing a real client (risk #7: hermetic
 * fast suite) — the browser client from lib/supabase/client.ts satisfies it.
 */
export interface OrderChatRealtimeClient {
  channel(name: string): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): Promise<unknown>;
}

/** One channel per mounted order page (free-tier budget, risk #11). */
export function orderChatChannelName(orderId: string): string {
  return `order-chat:${orderId}`;
}

/**
 * The `postgres_changes` filter string. Exactness matters — a typo here does
 * not error, it silently kills delivery — so it's pinned by a unit test.
 */
export function messageFilter(orderId: string): string {
  return `order_id=eq.${orderId}`;
}

/**
 * Subscribe to INSERTs on this order's messages. Returns an unsubscribe
 * function (call it on unmount — leaving channels open leaks connections
 * against the 200-connection free-tier cap). `onStatus` surfaces the channel
 * lifecycle ("SUBSCRIBED", "CHANNEL_ERROR", …) so the component can fall back
 * to polling when realtime isn't available (e.g. 0007 not yet applied).
 */
export function subscribeToOrderMessages(
  client: OrderChatRealtimeClient,
  orderId: string,
  onInsert: (message: ChatMessageRow) => void,
  onStatus?: (status: string) => void,
): () => void {
  const channel = client.channel(orderChatChannelName(orderId));
  channel
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "order_messages",
        filter: messageFilter(orderId),
      },
      (payload: { new: ChatMessageRow }) => onInsert(payload.new),
    )
    .subscribe((status: string) => onStatus?.(status));
  return () => {
    void client.removeChannel(channel);
  };
}

/** Stable render order: created_at first, id as the clock-skew tiebreaker (risk #9). */
function compareMessages(a: ChatMessageRow, b: ChatMessageRow): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * Optimistic-send reconciliation primitive (pure). Merges `incoming` into
 * `list`, deduping by id — the sender receives their own message twice (action
 * return + realtime event), so the second arrival is a no-op. `replaceId`
 * removes the optimistic temp row the real one replaces. Always returns a new
 * array in `compareMessages` order; never mutates `list`.
 */
export function mergeMessage(
  list: ChatMessageRow[],
  incoming: ChatMessageRow,
  replaceId?: string,
): ChatMessageRow[] {
  const base = replaceId === undefined ? list : list.filter((m) => m.id !== replaceId);
  if (base.some((m) => m.id === incoming.id)) return [...base];
  return [...base, incoming].sort(compareMessages);
}

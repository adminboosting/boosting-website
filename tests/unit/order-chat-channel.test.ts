import { describe, expect, it } from "vitest";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  mergeMessage,
  messageFilter,
  orderChatChannelName,
  subscribeToOrderMessages,
  type ChatMessageRow,
  type OrderChatRealtimeClient,
} from "@/lib/realtime/order-chat-channel";

const ORDER_ID = "11111111-2222-3333-4444-555555555555";

function msg(overrides: Partial<ChatMessageRow> & { id: string }): ChatMessageRow {
  return {
    order_id: ORDER_ID,
    sender_id: "aaaaaaaa-0000-0000-0000-000000000000",
    body: "ribbit",
    is_system: false,
    created_at: "2026-07-16T12:00:00.000Z",
    ...overrides,
  };
}

/**
 * Hand-rolled stub client (risk #7: the hermetic fast suite never constructs a
 * real Supabase client or reads env). Records the exact wiring so a typo in
 * the channel name / filter — which silently kills delivery — fails here.
 */
function stubClient() {
  const calls = {
    channelNames: [] as string[],
    on: [] as Array<{ type: string; filter: Record<string, unknown>; cb: (p: unknown) => void }>,
    statusCbs: [] as Array<((status: string) => void) | undefined>,
    removed: [] as unknown[],
  };
  const channel = {
    on(type: string, filter: Record<string, unknown>, cb: (p: unknown) => void) {
      calls.on.push({ type, filter, cb });
      return channel;
    },
    subscribe(cb?: (status: string) => void) {
      calls.statusCbs.push(cb);
      cb?.("SUBSCRIBED");
      return channel;
    },
  };
  const client: OrderChatRealtimeClient = {
    channel(name: string) {
      calls.channelNames.push(name);
      return channel as unknown as RealtimeChannel;
    },
    removeChannel(ch) {
      calls.removed.push(ch);
      return Promise.resolve("ok");
    },
  };
  return { client, calls, channel };
}

describe("orderChatChannelName / messageFilter", () => {
  it("produces the exact channel name", () => {
    expect(orderChatChannelName(ORDER_ID)).toBe(`order-chat:${ORDER_ID}`);
  });

  it("produces the exact postgres_changes filter string", () => {
    // A typo here doesn't error — it silently kills delivery. Pin it.
    expect(messageFilter(ORDER_ID)).toBe(`order_id=eq.${ORDER_ID}`);
  });
});

describe("subscribeToOrderMessages", () => {
  it("wires one channel with the INSERT listener on public.order_messages", () => {
    const { client, calls } = stubClient();
    subscribeToOrderMessages(client, ORDER_ID, () => undefined);

    expect(calls.channelNames).toEqual([`order-chat:${ORDER_ID}`]);
    expect(calls.on).toHaveLength(1);
    expect(calls.on[0]!.type).toBe("postgres_changes");
    expect(calls.on[0]!.filter).toEqual({
      event: "INSERT",
      schema: "public",
      table: "order_messages",
      filter: `order_id=eq.${ORDER_ID}`,
    });
  });

  it("delivers payload.new to onInsert", () => {
    const { client, calls } = stubClient();
    const seen: ChatMessageRow[] = [];
    subscribeToOrderMessages(client, ORDER_ID, (m) => seen.push(m));

    const incoming = msg({ id: "m1" });
    calls.on[0]!.cb({ new: incoming });
    expect(seen).toEqual([incoming]);
  });

  it("reports channel status through onStatus", () => {
    const { client } = stubClient();
    const statuses: string[] = [];
    subscribeToOrderMessages(client, ORDER_ID, () => undefined, (s) => statuses.push(s));
    expect(statuses).toEqual(["SUBSCRIBED"]);
  });

  it("returns an unsubscribe that removes the exact channel", () => {
    const { client, calls, channel } = stubClient();
    const unsubscribe = subscribeToOrderMessages(client, ORDER_ID, () => undefined);
    expect(calls.removed).toEqual([]);
    unsubscribe();
    expect(calls.removed).toEqual([channel]);
  });
});

describe("mergeMessage", () => {
  it("appends a new message in created_at order", () => {
    const a = msg({ id: "a", created_at: "2026-07-16T12:00:00.000Z" });
    const c = msg({ id: "c", created_at: "2026-07-16T12:02:00.000Z" });
    const b = msg({ id: "b", created_at: "2026-07-16T12:01:00.000Z" });
    expect(mergeMessage([a, c], b).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("dedupes by id (own message arrives via action return AND realtime)", () => {
    const a = msg({ id: "a" });
    const merged = mergeMessage([a], msg({ id: "a", body: "duplicate arrival" }));
    expect(merged).toHaveLength(1);
    expect(merged[0]!.body).toBe("ribbit"); // first arrival wins
  });

  it("breaks created_at ties by id so clock-skewed inserts don't jitter", () => {
    const t = "2026-07-16T12:00:00.000Z";
    const merged = mergeMessage([msg({ id: "b", created_at: t })], msg({ id: "a", created_at: t }));
    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("replaces the optimistic temp row via replaceId", () => {
    const temp = msg({ id: "temp-123", created_at: "2026-07-16T12:00:00.000Z" });
    const real = msg({ id: "real-1", created_at: "2026-07-16T12:00:01.000Z" });
    const merged = mergeMessage([temp], real, "temp-123");
    expect(merged.map((m) => m.id)).toEqual(["real-1"]);
  });

  it("drops the temp without duplicating when the realtime copy landed first", () => {
    const real = msg({ id: "real-1" });
    const merged = mergeMessage([msg({ id: "temp-123" }), real], real, "temp-123");
    expect(merged.map((m) => m.id)).toEqual(["real-1"]);
  });

  it("never mutates the input list", () => {
    const list = [msg({ id: "a" })];
    const snapshot = [...list];
    mergeMessage(list, msg({ id: "b" }));
    mergeMessage(list, msg({ id: "a" }), "a");
    expect(list).toEqual(snapshot);
  });
});

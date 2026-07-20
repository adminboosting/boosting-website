import { describe, expect, it } from "vitest";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  notificationFilter,
  notificationsChannelName,
  subscribeToNotifications,
  type NotificationRow,
  type NotificationsRealtimeClient,
} from "@/lib/realtime/notifications-channel";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function row(overrides: Partial<NotificationRow> & { id: string }): NotificationRow {
  return {
    recipient_id: USER_ID,
    actor_id: "11111111-2222-3333-4444-555555555555",
    order_id: "99999999-8888-7777-6666-555555555555",
    kind: "booster_ping",
    title: "A customer is waiting",
    body: "Open the order to respond.",
    created_at: "2026-07-20T12:00:00.000Z",
    read_at: null,
    ...overrides,
  };
}

/** Hand-rolled stub — no real client, no env (hermetic fast suite). */
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
  const client: NotificationsRealtimeClient = {
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

describe("notifications-channel", () => {
  it("derives a per-user channel name and recipient filter", () => {
    expect(notificationsChannelName(USER_ID)).toBe(`notifications:${USER_ID}`);
    expect(notificationFilter(USER_ID)).toBe(`recipient_id=eq.${USER_ID}`);
  });

  it("wires an INSERT subscription with the exact table + filter", () => {
    const { client, calls } = stubClient();
    subscribeToNotifications(client, USER_ID, () => undefined);

    expect(calls.channelNames).toEqual([`notifications:${USER_ID}`]);
    expect(calls.on).toHaveLength(1);
    expect(calls.on[0]?.type).toBe("postgres_changes");
    expect(calls.on[0]?.filter).toMatchObject({
      event: "INSERT",
      schema: "public",
      table: "notifications",
      filter: `recipient_id=eq.${USER_ID}`,
    });
  });

  it("delivers inserted rows to onInsert and reports channel status", () => {
    const { client, calls } = stubClient();
    const received: NotificationRow[] = [];
    let status = "";
    subscribeToNotifications(
      client,
      USER_ID,
      (n) => received.push(n),
      (s) => (status = s),
    );

    const payload = row({ id: "abc" });
    calls.on[0]?.cb({ new: payload });

    expect(received).toEqual([payload]);
    expect(status).toBe("SUBSCRIBED");
  });

  it("unsubscribe removes the channel", () => {
    const { client, calls } = stubClient();
    const unsubscribe = subscribeToNotifications(client, USER_ID, () => undefined);
    unsubscribe();
    expect(calls.removed).toHaveLength(1);
  });
});

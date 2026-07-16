import { describe, expect, it } from "vitest";
import {
  ORDER_STATUS_TRANSITIONS,
  OrderStatusError,
  assertTransition,
  canTransition,
  type OrderStatus,
} from "@/lib/orders/transitions";

/** The exact pairs seeded in supabase/migrations/0003_orders.sql. */
const SEEDED_PAIRS: Array<[OrderStatus, OrderStatus]> = [
  ["pending_payment", "paid"],
  ["pending_payment", "cancelled"],
  ["paid", "assigned"],
  ["paid", "cancelled"],
  ["paid", "refunded"],
  ["assigned", "in_progress"],
  ["assigned", "paused"],
  ["assigned", "cancelled"],
  ["in_progress", "paused"],
  ["in_progress", "completed"],
  ["in_progress", "cancelled"],
  ["paused", "in_progress"],
  ["paused", "cancelled"],
  ["completed", "refunded"],
];

const ALL_STATUSES = Object.keys(ORDER_STATUS_TRANSITIONS) as OrderStatus[];

describe("ORDER_STATUS_TRANSITIONS", () => {
  it("contains exactly the seeded pairs, nothing more", () => {
    const flattened = ALL_STATUSES.flatMap((from) =>
      ORDER_STATUS_TRANSITIONS[from].map((to) => `${from}->${to}`),
    ).sort();
    const seeded = SEEDED_PAIRS.map(([from, to]) => `${from}->${to}`).sort();
    expect(flattened).toEqual(seeded);
  });

  it("treats cancelled and refunded as terminal", () => {
    expect(ORDER_STATUS_TRANSITIONS.cancelled).toEqual([]);
    expect(ORDER_STATUS_TRANSITIONS.refunded).toEqual([]);
  });
});

describe("canTransition", () => {
  it("allows every seeded pair", () => {
    for (const [from, to] of SEEDED_PAIRS) {
      expect(canTransition(from, to), `${from} -> ${to}`).toBe(true);
    }
  });

  it("rejects representative illegal pairs", () => {
    expect(canTransition("pending_payment", "completed")).toBe(false);
    expect(canTransition("completed", "paid")).toBe(false);
    expect(canTransition("pending_payment", "assigned")).toBe(false);
    expect(canTransition("cancelled", "paid")).toBe(false);
    expect(canTransition("refunded", "pending_payment")).toBe(false);
  });

  it("rejects same-status (not a transition)", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status), `${status} -> ${status}`).toBe(false);
    }
  });
});

describe("assertTransition", () => {
  it("passes silently on a legal pair", () => {
    expect(() => assertTransition("pending_payment", "paid")).not.toThrow();
  });

  it("throws OrderStatusError with code invalid_transition on an illegal pair", () => {
    let caught: unknown;
    try {
      assertTransition("completed", "paid");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OrderStatusError);
    const err = caught as OrderStatusError;
    expect(err.code).toBe("invalid_transition");
    expect(err.name).toBe("OrderStatusError");
    expect(err.message).toContain('"completed"');
    expect(err.message).toContain('"paid"');
  });
});

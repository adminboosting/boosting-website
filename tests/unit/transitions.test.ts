import { describe, expect, it } from "vitest";
import {
  BOOSTER_ALLOWED_TARGETS,
  ORDER_STATUS_TRANSITIONS,
  OrderStatusError,
  assertTransition,
  canBoosterAdvance,
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

describe("BOOSTER_ALLOWED_TARGETS / canBoosterAdvance", () => {
  const BOOSTER_FROMS = Object.keys(BOOSTER_ALLOWED_TARGETS) as Array<
    keyof typeof BOOSTER_ALLOWED_TARGETS
  >;

  it("is a strict subset of ORDER_STATUS_TRANSITIONS (subset property)", () => {
    const boosterPairs = BOOSTER_FROMS.flatMap((from) =>
      BOOSTER_ALLOWED_TARGETS[from].map((to) => `${from}->${to}`),
    );
    const seededPairs = new Set(
      ALL_STATUSES.flatMap((from) => ORDER_STATUS_TRANSITIONS[from].map((to) => `${from}->${to}`)),
    );
    for (const pair of boosterPairs) {
      expect(seededPairs.has(pair), `${pair} must be a seeded transition`).toBe(true);
    }
    // STRICT subset: the booster surface can do less than the full walk.
    expect(boosterPairs.length).toBeLessThan(seededPairs.size);
  });

  it("contains exactly the booster-operable pairs", () => {
    expect(BOOSTER_ALLOWED_TARGETS).toEqual({
      assigned: ["in_progress"],
      in_progress: ["paused", "completed"],
      paused: ["in_progress"],
    });
  });

  it("never reaches cancelled, refunded, or paid from any status", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ["cancelled", "refunded", "paid"] as OrderStatus[]) {
        expect(canBoosterAdvance(from, to), `${from} -> ${to}`).toBe(false);
      }
    }
  });

  it("agrees with membership over the full status × status matrix", () => {
    const map = BOOSTER_ALLOWED_TARGETS as Partial<Record<OrderStatus, readonly OrderStatus[]>>;
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const expected = map[from]?.includes(to) ?? false;
        expect(canBoosterAdvance(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });

  it("implies canTransition for every allowed pair (never wider than the walk)", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (canBoosterAdvance(from, to)) {
          expect(canTransition(from, to), `${from} -> ${to}`).toBe(true);
        }
      }
    }
  });
});

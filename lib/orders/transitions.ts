/**
 * Order status machine. Pure module (no "server-only", no supabase imports) so
 * both the fast suite and server actions can use it.
 *
 * The DB has NO trigger enforcing transitions — the seeded
 * `order_status_transitions` table (supabase/migrations/0003_orders.sql) is
 * data, not a constraint. This map mirrors it exactly and is the single
 * app-side gate: every server-side status write must go through
 * assertTransition. A db-suite test cross-checks this constant against the
 * seeded rows so the two can never drift.
 */

/** Mirrors the `order_status` enum (supabase/migrations/0001_foundation.sql). */
export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "assigned"
  | "in_progress"
  | "paused"
  | "completed"
  | "cancelled"
  | "refunded";

/**
 * Allowed transitions, keyed by from-status. `cancelled` and `refunded` are
 * terminal (no seeded rows); every other entry matches the insert in
 * 0003_orders.sql pair-for-pair.
 */
export const ORDER_STATUS_TRANSITIONS = {
  pending_payment: ["paid", "cancelled"],
  paid: ["assigned", "cancelled", "refunded"],
  assigned: ["in_progress", "paused", "cancelled"],
  in_progress: ["paused", "completed", "cancelled"],
  paused: ["in_progress", "cancelled"],
  completed: ["refunded"],
  cancelled: [],
  refunded: [],
} as const satisfies Record<OrderStatus, readonly OrderStatus[]>;

/** Thrown when a status write attempts a pair outside the seeded map. */
export class OrderStatusError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "OrderStatusError";
    this.code = code;
  }
}

/** True when `from -> to` is a seeded transition. Same-status is not a transition. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_STATUS_TRANSITIONS[from] as readonly OrderStatus[]).includes(to);
}

/** Assert `from -> to` is allowed; throws OrderStatusError("invalid_transition") otherwise. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new OrderStatusError(
      "invalid_transition",
      `Order status cannot change from "${from}" to "${to}".`,
    );
  }
}

/**
 * The booster-operable subset of the walk (Phase 3 booster surface): start,
 * pause, resume, complete. Strictly narrower than ORDER_STATUS_TRANSITIONS —
 * cancel/refund/payment moves never exist from the booster surface (admin
 * only). A unit test pins the subset property so the two maps can't drift.
 */
export const BOOSTER_ALLOWED_TARGETS = {
  assigned: ["in_progress"],
  in_progress: ["paused", "completed"],
  paused: ["in_progress"],
} as const satisfies Partial<Record<OrderStatus, readonly OrderStatus[]>>;

/**
 * True when `from -> to` is both a seeded transition AND booster-operable.
 * RLS lets an active booster update orders.status broadly
 * (orders_update_owner_or_staff is column-unrestricted) — this gate plus a
 * status-predicated UPDATE is the real state machine (risk #5).
 */
export function canBoosterAdvance(from: OrderStatus, to: OrderStatus): boolean {
  const targets = (BOOSTER_ALLOWED_TARGETS as Partial<Record<OrderStatus, readonly OrderStatus[]>>)[
    from
  ];
  return targets !== undefined && targets.includes(to) && canTransition(from, to);
}

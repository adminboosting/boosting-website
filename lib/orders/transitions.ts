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

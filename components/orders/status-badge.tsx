import type { OrderStatus } from "@/lib/orders/transitions";
import { motion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Badge tone per order status — THE shared copy (the planned three-way fold of
 * components/admin/order-status-badge.tsx, app/(shop)/orders/[id]/page.tsx and
 * app/(shop)/account/page.tsx; the admin path now re-exports from here).
 * Server-safe. Semantic tokens only (globals.css), no raw color values.
 */
export const ORDER_STATUS_META: Record<OrderStatus, { label: string; className: string }> = {
  pending_payment: {
    label: "Awaiting payment",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  paid: { label: "Paid", className: "border-primary/40 bg-primary/10 text-primary" },
  assigned: { label: "Booster assigned", className: "border-accent/40 bg-accent/10 text-accent" },
  in_progress: { label: "In progress", className: "border-primary/40 bg-primary/10 text-primary" },
  paused: { label: "Paused", className: "border-border bg-muted/40 text-muted-foreground" },
  completed: { label: "Completed", className: "border-success/40 bg-success/10 text-success" },
  cancelled: {
    label: "Cancelled",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  refunded: { label: "Refunded", className: "border-border bg-muted/40 text-muted-foreground" },
};

/**
 * `animateOnChange` opts into the `order.status-change` motion slot
 * (lib/motion.ts → .motion-status-change in globals.css): the span is keyed by
 * status so a client-side status advance remounts the badge and replays the
 * animation (same trick as calculator.total-change). Off by default so static
 * lists (admin tables, account page) don't animate on first paint.
 */
export function OrderStatusBadge({
  status,
  animateOnChange = false,
}: {
  status: OrderStatus;
  animateOnChange?: boolean;
}) {
  const meta = ORDER_STATUS_META[status];
  return (
    <span
      key={animateOnChange ? status : undefined}
      className={cn(
        animateOnChange && motion.statusChange,
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        meta.className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

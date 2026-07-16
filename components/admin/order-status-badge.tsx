import type { OrderStatus } from "@/lib/orders/transitions";
import { cn } from "@/lib/utils";

/**
 * Badge tone per order status — shared by both admin order pages. Third copy
 * of the map in app/(shop)/account/page.tsx and app/(shop)/orders/[id]/page.tsx
 * (which also owns the `order.status-change` motion slot); fold all three into
 * components/orders/status-badge.tsx in the next cleanup pass. Semantic tokens
 * only (globals.css), no raw color values.
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

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        meta.className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

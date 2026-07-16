import { ORDER_STATUS_META } from "@/components/orders/status-badge";
import type { OrderStatus } from "@/lib/orders/transitions";
import { cn } from "@/lib/utils";

/**
 * Server-safe vertical timeline of an order's `order_progress` rows, shared by
 * the customer and booster order pages (the admin page keeps its inline list
 * this phase). Presentational only — the caller fetches rows through its own
 * RLS-scoped client (`order_progress_select_participants` is the gate).
 * Card/muted-token conventions match the order pages; no raw color values.
 */

/** An `order_progress` row as PostgREST returns it (snake_case). */
export interface OrderProgressRow {
  id: string;
  status_from: OrderStatus | null;
  status_to: OrderStatus;
  note: string | null;
  created_at: string;
}

/** Timeline dot tone per destination status — text tokens from the badge palette. */
const DOT_TONES: Record<OrderStatus, string> = {
  pending_payment: "text-warning",
  paid: "text-primary",
  assigned: "text-accent",
  in_progress: "text-primary",
  paused: "text-muted-foreground",
  completed: "text-success",
  cancelled: "text-destructive",
  refunded: "text-muted-foreground",
};

/** Server-rendered absolute fallback; en-US to match the money formatter. */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

/**
 * "3 hours ago"-style label, falling back to the absolute date beyond a week
 * (server-rendered relative times go stale; a whole-day granularity keeps the
 * drift honest and the absolute timestamp is always in the title attribute).
 */
function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.round((then - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return RELATIVE_FORMAT.format(Math.trunc(seconds / 1), "second");
  if (abs < 3600) return RELATIVE_FORMAT.format(Math.trunc(seconds / 60), "minute");
  if (abs < 86400) return RELATIVE_FORMAT.format(Math.trunc(seconds / 3600), "hour");
  if (abs < 7 * 86400) return RELATIVE_FORMAT.format(Math.trunc(seconds / 86400), "day");
  return DATE_TIME_FORMAT.format(new Date(iso));
}

export function ProgressTimeline({
  rows,
  status,
}: {
  rows: OrderProgressRow[];
  status: OrderStatus;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/40 p-5">
        <h2 className="font-semibold">Progress</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No updates yet — this order is {ORDER_STATUS_META[status].label.toLowerCase()}.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <h2 className="font-semibold">Progress</h2>
      <ol className="mt-4 divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start gap-3 py-3 text-sm first:pt-0 last:pb-0">
            <span
              aria-hidden="true"
              className={cn(
                "mt-1 size-2 shrink-0 rounded-full bg-current",
                DOT_TONES[row.status_to],
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {row.status_from ? (
                  <>
                    <span className="text-muted-foreground">
                      {ORDER_STATUS_META[row.status_from].label}
                    </span>
                    <span aria-hidden="true" className="text-muted-foreground">
                      {" → "}
                    </span>
                    {ORDER_STATUS_META[row.status_to].label}
                  </>
                ) : (
                  ORDER_STATUS_META[row.status_to].label
                )}
              </p>
              {row.note && <p className="mt-0.5 text-muted-foreground">{row.note}</p>}
            </div>
            <time
              dateTime={row.created_at}
              title={DATE_TIME_FORMAT.format(new Date(row.created_at))}
              className="shrink-0 text-xs text-muted-foreground"
            >
              {relativeTime(row.created_at)}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}

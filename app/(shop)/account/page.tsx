import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Coins } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getSessionProfile } from "@/lib/auth/session";
import { getServiceByType } from "@/lib/catalog/content";
import { getGames } from "@/lib/catalog/source";
import type { OrderMode, ServiceType } from "@/lib/catalog/types";
import { formatUsdFromCents } from "@/lib/money";
import type { OrderStatus } from "@/lib/orders/transitions";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "My orders",
  description: "Your boost orders and store credit balance.",
  robots: { index: false },
};

/** The orders columns the list card reads, as PostgREST returns them (snake_case). */
interface AccountOrderRow {
  id: string;
  game_slug: string;
  service_type: ServiceType;
  mode: OrderMode;
  status: OrderStatus;
  total_cents: number;
  created_at: string;
}

/**
 * Badge tone per order status. Mirrors app/(shop)/orders/[id]/page.tsx (which
 * also owns the `order.status-change` motion slot) — extract both copies to
 * components/orders/status-badge.tsx once a third surface needs it.
 */
const STATUS_META: Record<OrderStatus, { label: string; className: string }> = {
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

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status];
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

/** Server-rendered dates; en-US to match the money formatter. */
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function AccountPage() {
  // Independent identity check (spec A2 layer 2) — the proxy only redirects.
  // getSessionProfile (rather than requireUser) because the page also shows
  // the store-credit balance; null covers signed-out and the zero-backend
  // deploy alike.
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const { user, profile } = session;

  // User-scoped client: RLS already limits reads to accessible orders, but
  // admins/boosters can access orders they don't own — the explicit user_id
  // filter keeps "My orders" literally mine for every role.
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, game_slug, service_type, mode, status, total_cents, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const orders = (data ?? []) as AccountOrderRow[];

  const games = await getGames();
  const gameName = (slug: string) => games.find((g) => g.slug === slug)?.name ?? slug;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My orders</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as {profile.display_name ?? profile.email ?? "your account"}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2 text-sm">
          <Coins className="size-4 text-accent" aria-hidden="true" />
          <span className="text-muted-foreground">Store credit</span>
          <span className="font-semibold tabular-nums">
            {formatUsdFromCents(profile.store_credit_cents)}
          </span>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="mt-8 rounded-xl border border-border bg-card/40 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No orders yet — configure a boost and it&rsquo;ll land here.
          </p>
          <Link href="/games" className={cn(buttonVariants({ size: "sm" }), "mt-4")}>
            Browse games
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {orders.map((order) => {
            const service = getServiceByType(order.service_type);
            return (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/40 p-5 transition-colors hover:bg-card/70"
                >
                  <div>
                    <p className="font-semibold">
                      {gameName(order.game_slug)} — {service.short}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Placed {DATE_FORMAT.format(new Date(order.created_at))} ·{" "}
                      {order.mode === "piloted" ? "Piloted" : "Duo"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <OrderStatusBadge status={order.status} />
                    <span className="font-semibold tabular-nums">
                      {formatUsdFromCents(order.total_cents)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ORDER_STATUS_META, OrderStatusBadge } from "@/components/admin/order-status-badge";
import { requireAdmin } from "@/lib/auth/session";
import { getServiceByType } from "@/lib/catalog/content";
import { getGames } from "@/lib/catalog/source";
import type { OrderMode, ServiceType } from "@/lib/catalog/types";
import { formatUsdFromCents } from "@/lib/money";
import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from "@/lib/orders/transitions";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin — orders",
  description: "Order queue for manual payment confirmation.",
  robots: { index: false },
};

/** The orders columns the queue reads, plus the customer via the user_id FK embed. */
interface AdminOrderRow {
  id: string;
  game_slug: string;
  service_type: ServiceType;
  mode: OrderMode;
  status: OrderStatus;
  total_cents: number;
  created_at: string;
  profiles: { email: string | null; display_name: string | null } | null;
}

/** Every order status, straight from the transition map so the two never drift. */
const ORDER_STATUSES = Object.keys(ORDER_STATUS_TRANSITIONS) as OrderStatus[];

/**
 * null = no filter ("all"). Anything unrecognized falls back to the queue's
 * default job: orders awaiting manual payment confirmation.
 */
function parseStatusFilter(raw: string | undefined): OrderStatus | null {
  if (raw === "all") return null;
  if (raw && (ORDER_STATUSES as readonly string[]).includes(raw)) return raw as OrderStatus;
  return "pending_payment";
}

/** Server-rendered dates; en-US to match the money formatter. */
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // Independent identity check on top of the layout's — layers hold alone.
  await requireAdmin();
  const { status } = await searchParams;
  const filter = parseStatusFilter(status);

  // User-scoped client: admins pass RLS `orders_select_participants` via
  // is_admin() inside can_access_order, and `profiles_select_self_or_admin`
  // permits the customer embed — no service role needed to read.
  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select(
      "id, game_slug, service_type, mode, status, total_cents, created_at, profiles (email, display_name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter) query = query.eq("status", filter);
  const { data } = await query;
  const orders = (data ?? []) as unknown as AdminOrderRow[];

  const games = await getGames();
  const gameName = (slug: string) => games.find((g) => g.slug === slug)?.name ?? slug;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Confirm manual payments and manage orders. Newest first, capped at 200 rows.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Filter orders by status">
        <FilterChip href="/admin/orders?status=all" active={filter === null} label="All" />
        {ORDER_STATUSES.map((s) => (
          <FilterChip
            key={s}
            href={`/admin/orders?status=${s}`}
            active={filter === s}
            label={ORDER_STATUS_META[s].label}
          />
        ))}
      </nav>

      {orders.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-card/40 p-8 text-center">
          <p className="text-sm text-muted-foreground">No orders match this filter.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((order) => (
                <tr key={order.id} className="transition-colors hover:bg-card/70">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      #{order.id.slice(0, 8)}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {DATE_FORMAT.format(new Date(order.created_at))}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {order.profiles?.email ?? order.profiles?.display_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {gameName(order.game_slug)} — {getServiceByType(order.service_type).short}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {order.mode === "piloted" ? "Piloted" : "Duo"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {formatUsdFromCents(order.total_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Coins, MessageCircle } from "lucide-react";
import { OrderStatusBadge } from "@/components/orders/status-badge";
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
 * One message row of the unread-count query. The embedded `message_reads` is
 * RLS-filtered to the CALLER's receipts only (`message_reads_own`), so an
 * empty array means "this viewer hasn't read it" — nobody's read state leaks.
 */
interface UnreadCandidateRow {
  id: string;
  order_id: string;
  sender_id: string | null;
  message_reads: { message_id: string }[];
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

  // Unread messages per order: one grouped query — participant-visible
  // messages with the caller's own receipts embedded (RLS scopes both hops).
  // A message counts as unread when someone else (or the system, sender_id
  // null) sent it and no own receipt exists; the JS filter keeps null senders
  // in, which a PostgREST `neq` would silently drop.
  const unreadByOrder = new Map<string, number>();
  if (orders.length > 0) {
    const { data: messageData } = await supabase
      .from("order_messages")
      .select("id, order_id, sender_id, message_reads(message_id)")
      .in(
        "order_id",
        orders.map((order) => order.id),
      );
    for (const row of (messageData ?? []) as UnreadCandidateRow[]) {
      if (row.sender_id === user.id || row.message_reads.length > 0) continue;
      unreadByOrder.set(row.order_id, (unreadByOrder.get(row.order_id) ?? 0) + 1);
    }
  }

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
            const unread = unreadByOrder.get(order.id) ?? 0;
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
                    {unread > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <MessageCircle aria-hidden="true" className="size-3" />
                        {unread} unread
                        <span className="sr-only">
                          {" "}
                          message{unread === 1 ? "" : "s"} on this order
                        </span>
                      </span>
                    )}
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

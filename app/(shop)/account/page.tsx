import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { LoyaltyTierCard } from "@/components/account/loyalty-tier-card";
import { ReferralCard } from "@/components/account/referral-card";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { getSessionProfile } from "@/lib/auth/session";
import { getServiceByType } from "@/lib/catalog/content";
import { getGames } from "@/lib/catalog/source";
import type { OrderMode, ServiceType } from "@/lib/catalog/types";
import { describeLedgerKind, type LoyaltyLedgerKind } from "@/lib/loyalty/view";
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

/**
 * The loyalty_ledger columns the credit-activity table reads, as PostgREST
 * returns them (snake_case). `amount_cents` is negative on spend rows;
 * `order_id` is nullable (manual adjustments, deleted orders).
 */
interface LoyaltyLedgerRow {
  id: string;
  order_id: string | null;
  kind: LoyaltyLedgerKind;
  amount_cents: number;
  balance_after_cents: number;
  note: string | null;
  created_at: string;
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

  // Credit activity: `loyalty_ledger_select_own` already scopes reads to the
  // caller, but keep the explicit user_id filter per the "literally mine"
  // convention above (admins can read every row under that policy).
  const { data: ledgerData } = await supabase
    .from("loyalty_ledger")
    .select("id, order_id, kind, amount_cents, balance_after_cents, note, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const ledger = (ledgerData ?? []) as LoyaltyLedgerRow[];

  const games = await getGames();
  const gameName = (slug: string) => games.find((g) => g.slug === slug)?.name ?? slug;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My orders</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as {profile.display_name ?? profile.email ?? "your account"}
        </p>
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

      <LoyaltyTierCard
        lifetimeSpendCents={profile.lifetime_spend_cents}
        storeCreditCents={profile.store_credit_cents}
      />

      <section aria-labelledby="credit-activity-heading" className="mt-8">
        <h2 id="credit-activity-heading" className="text-sm font-semibold">
          Credit activity
        </h2>
        {ledger.length === 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-card/40 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No credit activity yet — cashback lands here when a payment is confirmed.
            </p>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ledger.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {DATE_FORMAT.format(new Date(entry.created_at))}
                    </td>
                    <td className="px-4 py-3">
                      {describeLedgerKind(entry.kind)}
                      {entry.note && (
                        <span className="ml-1 text-xs text-muted-foreground">— {entry.note}</span>
                      )}
                      {entry.order_id && (
                        <Link
                          href={`/orders/${entry.order_id}`}
                          className="ml-2 text-xs text-primary underline-offset-4 hover:underline"
                        >
                          View order
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {entry.amount_cents > 0 ? "+" : ""}
                      {formatUsdFromCents(entry.amount_cents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatUsdFromCents(entry.balance_after_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ReferralCard userId={user.id} />
    </div>
  );
}

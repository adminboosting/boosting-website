import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, ShieldCheck } from "lucide-react";
import { CredentialForm } from "@/components/orders/credential-form";
import { requireUser } from "@/lib/auth/session";
import { getServiceByType } from "@/lib/catalog/content";
import { getGame, getPlacementPrices, getRanks, getRegions } from "@/lib/catalog/source";
import type { GameSlug, OrderMode, Rank, ServiceType } from "@/lib/catalog/types";
import { SUPPORT_EMAIL_FALLBACK } from "@/lib/config";
import { formatUsdFromCents } from "@/lib/money";
import type { OrderStatus } from "@/lib/orders/transitions";
import type {
  NetWinsConfig,
  PlacementsConfig,
  QuoteConfig,
  RankBoostConfig,
} from "@/lib/pricing/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Order details",
  description: "Track your boost order, payments, and credential status.",
  robots: { index: false },
};

/** The orders columns this page reads, as PostgREST returns them (snake_case). */
interface OrderRow {
  id: string;
  user_id: string;
  game_slug: string;
  service_type: ServiceType;
  mode: OrderMode;
  region_code: string;
  config: QuoteConfig;
  status: OrderStatus;
  subtotal_cents: number;
  discount_cents: number;
  store_credit_applied_cents: number;
  total_cents: number;
  eta_hours: number | null;
  coupon_code: string | null;
  created_at: string;
}

/** Mirrors the `payment_provider` / `payment_status` enums (0001_foundation.sql). */
type PaymentProvider = "nowpayments" | "stripe_test" | "manual";
type PaymentStatus = "created" | "pending" | "confirmed" | "failed" | "refunded";

interface PaymentRow {
  id: string;
  provider: PaymentProvider;
  amount_cents: number;
  status: PaymentStatus;
  created_at: string;
}

const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  manual: "Manual / crypto",
  nowpayments: "NOWPayments",
  stripe_test: "Stripe (test)",
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  created: "Awaiting payment",
  pending: "Payment pending",
  confirmed: "Confirmed",
  failed: "Failed",
  refunded: "Refunded",
};

/**
 * Badge tone per order status. Mirrored in app/(shop)/account/page.tsx —
 * extract to components/orders/status-badge.tsx once a third surface needs it.
 * Semantic tokens only (globals.css), no raw color values.
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

/**
 * The `order.status-change` motion slot (lib/motion.ts). `motion-status-change`
 * is the single swap point for Claude Design output — a no-op until globals.css
 * defines it, and the global reduced-motion rule collapses whatever it becomes.
 * The span is keyed by status so a client-side status advance remounts the
 * badge and replays the slot's animation (same trick as calculator.total-change).
 */
function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      key={status}
      className={cn(
        "motion-status-change inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        meta.className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

/** Piloted orders accept credentials only while there is work left to start/finish. */
const CREDENTIAL_WINDOW_STATUSES: readonly OrderStatus[] = [
  "paid",
  "assigned",
  "in_progress",
  "paused",
];

/**
 * True when a live (non-purged) credential envelope exists for this order.
 * order_credentials is deny-all under RLS (service-role only, by design), so
 * existence is checked through the admin client and ONLY the row id is
 * selected — ciphertext never leaves the vault path. Degrades to false when
 * the service role isn't configured (the form still renders; its action
 * returns a typed error instead of accepting plaintext).
 */
async function hasStoredCredentials(orderId: string): Promise<boolean> {
  if (!isServiceRoleConfigured()) return false;
  const admin = createAdminClient();
  const { data } = await admin
    .from("order_credentials")
    .select("id")
    .eq("order_id", orderId)
    .is("deleted_at", null)
    .maybeSingle();
  return Boolean(data);
}

/** Server-rendered dates; en-US to match the money formatter. */
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Same presentation the calculator quoted at purchase time: a ±20% range. */
function formatEtaRange(etaHours: number): string {
  const low = Math.max(1, Math.round(etaHours * 0.8 * 2) / 2);
  const high = Math.round(etaHours * 1.2 * 2) / 2;
  return low === high ? `${low}` : `${low}–${high}`;
}

function rankLabel(ranks: Rank[], sortIndex: number): string {
  return ranks.find((r) => r.sortIndex === sortIndex)?.label ?? `Rank ${sortIndex}`;
}

interface SummaryRow {
  label: string;
  value: string;
}

/**
 * Human-readable selection summary from the persisted order. orders.config is
 * the camelCase QuoteConfig (see DECISIONS.md) — service_type picks which
 * member of the union it is, hence the casts.
 */
async function buildSummaryRows(order: OrderRow): Promise<SummaryRow[]> {
  const gameSlug = order.game_slug as GameSlug;
  const [game, regions] = await Promise.all([getGame(gameSlug), getRegions(gameSlug)]);
  const service = getServiceByType(order.service_type);

  const rows: SummaryRow[] = [{ label: "Service", value: `${game.name} — ${service.name}` }];

  if (order.service_type === "rank_boost") {
    const config = order.config as RankBoostConfig;
    const ranks = await getRanks(gameSlug);
    rows.push({
      label: "Boost",
      value: `${rankLabel(ranks, config.currentRankIndex)} → ${rankLabel(ranks, config.desiredRankIndex)}`,
    });
    if (config.currentLpBand !== undefined) {
      rows.push({ label: "Current LP", value: `${config.currentLpBand} LP` });
    }
    if (config.queue === "flex") rows.push({ label: "Queue", value: "Flex" });
  } else if (order.service_type === "placements") {
    const config = order.config as PlacementsConfig;
    const bands = await getPlacementPrices(gameSlug);
    rows.push({
      label: "Placements",
      value: `${config.gamesCount} game${config.gamesCount === 1 ? "" : "s"}`,
    });
    rows.push({
      label: "Last season",
      value: bands.find((b) => b.band === config.previousBand)?.label ?? config.previousBand,
    });
  } else {
    const config = order.config as NetWinsConfig;
    const ranks = await getRanks(gameSlug);
    rows.push({
      label: "Net wins",
      value: `${config.winsCount} win${config.winsCount === 1 ? "" : "s"}`,
    });
    rows.push({ label: "Current rank", value: rankLabel(ranks, config.currentRankIndex) });
  }

  rows.push({
    label: "Mode",
    value:
      order.mode === "piloted" ? "Piloted — a pro plays your account" : "Duo — you play together",
  });
  rows.push({
    label: "Region",
    value: regions.find((r) => r.code === order.region_code)?.label ?? order.region_code,
  });
  if (order.coupon_code) rows.push({ label: "Coupon", value: order.coupon_code });
  rows.push({ label: "Placed", value: DATE_FORMAT.format(new Date(order.created_at)) });

  return rows;
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Independent identity check (spec A2 layer 2) — the proxy only redirects.
  const user = await requireUser();

  // User-scoped client: RLS `orders_select_participants` (can_access_order) is
  // the gate. A row the viewer can't access looks identical to a missing row,
  // so both are a 404 — the page never distinguishes "forbidden" from "absent".
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, user_id, game_slug, service_type, mode, region_code, config, status, subtotal_cents, discount_cents, store_credit_applied_cents, total_cents, eta_hours, coupon_code, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  const order = data as OrderRow | null;
  if (!order) notFound();

  const [rows, paymentsResult] = await Promise.all([
    buildSummaryRows(order),
    // RLS `payments_select_owner_or_admin` lets participants read payment rows.
    supabase
      .from("payments")
      .select("id, provider, amount_cents, status, created_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true }),
  ]);
  const payments = (paymentsResult.data ?? []) as PaymentRow[];

  // Credential intake is owner-only UI; storeOrderCredentials re-verifies
  // ownership + piloted + status server-side regardless of what renders here.
  const showCredentialSection =
    order.user_id === user.id &&
    order.mode === "piloted" &&
    CREDENTIAL_WINDOW_STATUSES.includes(order.status);
  const hasCredentials = showCredentialSection ? await hasStoredCredentials(order.id) : false;

  const showEta =
    order.eta_hours !== null && !["completed", "cancelled", "refunded"].includes(order.status);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/account"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        My orders
      </Link>

      <header className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Order #{order.id.slice(0, 8)}</h1>
        <OrderStatusBadge status={order.status} />
      </header>

      {order.status === "pending_payment" && (
        <div className="mt-6 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <Clock className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            We&rsquo;ll confirm your payment manually — you&rsquo;ll get an email as soon as it
            clears. Questions? Write to{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL_FALLBACK}`}
              className="font-medium underline underline-offset-4"
            >
              {SUPPORT_EMAIL_FALLBACK}
            </a>
            .
          </span>
        </div>
      )}

      <section className="mt-6 rounded-xl border border-border bg-card/40 p-5">
        <h2 className="font-semibold">Order summary</h2>

        <dl className="mt-4 space-y-2 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 border-t border-border pt-4">
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatUsdFromCents(order.subtotal_cents)}</dd>
            </div>
            {order.discount_cents > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Discounts</dt>
                <dd className="tabular-nums text-success">
                  −{formatUsdFromCents(order.discount_cents)}
                </dd>
              </div>
            )}
            {order.store_credit_applied_cents > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Store credit</dt>
                <dd className="tabular-nums text-success">
                  −{formatUsdFromCents(order.store_credit_applied_cents)}
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-2xl font-bold tabular-nums">
              {formatUsdFromCents(order.total_cents)}
            </span>
          </div>
          {showEta && order.eta_hours !== null && (
            <p className="mt-1 text-right text-xs text-muted-foreground">
              Est. {formatEtaRange(order.eta_hours)} hours
            </p>
          )}
        </div>
      </section>

      {payments.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold tracking-tight">Payments</h2>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card/40">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-medium">{PROVIDER_LABELS[payment.provider]}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {DATE_TIME_FORMAT.format(new Date(payment.created_at))}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium tabular-nums">
                    {formatUsdFromCents(payment.amount_cents)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {PAYMENT_STATUS_LABELS[payment.status]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showCredentialSection && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold tracking-tight">Account credentials</h2>
          {hasCredentials ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
              <span>
                Credentials received — stored encrypted (AES-256-GCM) and deleted automatically
                after your order completes.
              </span>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Your booster needs your account login to start a piloted order. It&rsquo;s encrypted
                before it ever touches our database and deleted automatically after completion.
              </p>
              <div className="mt-3">
                <CredentialForm orderId={order.id} />
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

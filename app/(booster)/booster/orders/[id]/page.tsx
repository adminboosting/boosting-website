import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  markBoosterMessagesRead,
  sendBoosterMessage,
} from "@/app/(booster)/booster/orders/[id]/actions";
import { CredentialReveal } from "@/components/booster/credential-reveal";
import { ProgressControls } from "@/components/booster/progress-controls";
import { OrderChat } from "@/components/chat/order-chat";
import { ProgressTimeline, type OrderProgressRow } from "@/components/orders/progress-timeline";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { requireBooster } from "@/lib/auth/session";
import { getServiceByType } from "@/lib/catalog/content";
import { getGame, getPlacementPrices, getRanks, getRegions } from "@/lib/catalog/source";
import type { GameSlug, OrderMode, Rank, ServiceType } from "@/lib/catalog/types";
import { CREDENTIAL_ACCEPTING_STATUSES } from "@/lib/credentials/store";
import type { OrderStatus } from "@/lib/orders/transitions";
import type {
  NetWinsConfig,
  PlacementsConfig,
  QuoteConfig,
  RankBoostConfig,
} from "@/lib/pricing/types";
import type { ChatMessageRow } from "@/lib/realtime/order-chat-channel";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Booster — order",
  description: "Work an assigned boost order: progress, chat, and credentials.",
  robots: { index: false },
};

/**
 * The orders columns this page reads, as PostgREST returns them (snake_case).
 * Deliberately NO money columns (subtotal/discount/credit/total/coupon) —
 * boosters never see customer pricing; earnings come from booster_earnings.
 */
interface BoosterOrderRow {
  id: string;
  game_slug: string;
  service_type: ServiceType;
  mode: OrderMode;
  region_code: string;
  config: QuoteConfig;
  status: OrderStatus;
  eta_hours: number | null;
  created_at: string;
}

/** Server-rendered dates; en-US to match the rest of the site. */
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function rankLabel(ranks: Rank[], sortIndex: number): string {
  return ranks.find((r) => r.sortIndex === sortIndex)?.label ?? `Rank ${sortIndex}`;
}

interface SummaryRow {
  label: string;
  value: string;
}

/**
 * Human-readable job summary from the persisted order. Mirrors the customer
 * page's builder (app/(shop)/orders/[id]/page.tsx) minus every money row —
 * the duplication is deliberate; the two surfaces own their files. orders.config
 * is the camelCase QuoteConfig; service_type picks the union member.
 */
async function buildJobRows(order: BoosterOrderRow): Promise<SummaryRow[]> {
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
      order.mode === "piloted" ? "Piloted — you play the customer's account" : "Duo — play together",
  });
  rows.push({
    label: "Region",
    value: regions.find((r) => r.code === order.region_code)?.label ?? order.region_code,
  });
  if (order.eta_hours !== null) rows.push({ label: "Quoted ETA", value: `~${order.eta_hours}h` });
  rows.push({ label: "Placed", value: DATE_FORMAT.format(new Date(order.created_at)) });

  return rows;
}

/**
 * True when a live (non-purged) credential envelope exists. Same id-only
 * existence probe as the customer page: order_credentials is deny-all under
 * RLS, so the admin client checks existence and ONLY selects the row id —
 * ciphertext stays on the reveal action's logged path.
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

export default async function BoosterOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Independent identity check (spec A2 layer 2) — the layout only redirects.
  const session = await requireBooster();
  const { user, profile } = session;

  // User-scoped client: RLS `orders_select_participants` (can_access_order) is
  // the gate. Not-visible and missing rows are both a 404 — never distinguish
  // "forbidden" from "absent". A malformed id also lands here.
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, game_slug, service_type, mode, region_code, config, status, eta_hours, created_at")
    .eq("id", id)
    .maybeSingle();
  const order = data as BoosterOrderRow | null;
  if (!order) notFound();

  const [assignmentResult, messagesResult, progressResult, jobRows] = await Promise.all([
    // Explicit ACTIVE-assignment check on top of RLS: can_access_order also
    // passes admins, and this page's controls belong to the assigned booster.
    supabase
      .from("order_assignments")
      .select("id")
      .eq("order_id", order.id)
      .eq("booster_id", user.id)
      .eq("is_active", true)
      .maybeSingle(),
    // Last 100 messages: fetch newest-first then reverse to ascending.
    supabase
      .from("order_messages")
      .select("id, order_id, sender_id, body, is_system, created_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("order_progress")
      .select("id, status_from, status_to, note, created_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true }),
    buildJobRows(order),
  ]);

  // Admins (requireBooster lets them through to inspect) may view without an
  // assignment; everyone else 404s. Controls stay assignment-gated below —
  // the actions re-verify the active assignment server-side regardless.
  const isAssignedBooster = Boolean(assignmentResult.data);
  if (!isAssignedBooster && profile.role !== "admin") notFound();

  const messages = ((messagesResult.data ?? []) as ChatMessageRow[]).slice().reverse();
  const progress = (progressResult.data ?? []) as OrderProgressRow[];

  // Chat mirrors the customer page's posture: hidden for cancelled, read-only
  // history for the other terminal states (no coordination left to do).
  const chatHidden = order.status === "cancelled";
  const chatReadOnly = order.status === "completed" || order.status === "refunded";

  const showCredentialSection =
    isAssignedBooster &&
    order.mode === "piloted" &&
    CREDENTIAL_ACCEPTING_STATUSES.includes(order.status);
  const hasCredentials = showCredentialSection ? await hasStoredCredentials(order.id) : false;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/booster"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        Booster desk
      </Link>

      <header className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Order #{order.id.slice(0, 8)}</h1>
        <OrderStatusBadge status={order.status} animateOnChange />
      </header>

      <section className="mt-6 rounded-xl border border-border bg-card/40 p-5">
        <h2 className="font-semibold">Job summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          {jobRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {isAssignedBooster && (
        <div className="mt-6">
          <ProgressControls orderId={order.id} status={order.status} />
        </div>
      )}

      <div className="mt-6">
        <ProgressTimeline rows={progress} status={order.status} />
      </div>

      {!chatHidden && (
        <div className="mt-6">
          <OrderChat
            orderId={order.id}
            currentUserId={user.id}
            initialMessages={messages}
            sendAction={sendBoosterMessage.bind(null, order.id)}
            markReadAction={markBoosterMessagesRead.bind(null, order.id)}
            readOnly={chatReadOnly}
          />
        </div>
      )}

      {showCredentialSection && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold tracking-tight">Account credentials</h2>
          {hasCredentials ? (
            <div className="mt-3">
              <CredentialReveal orderId={order.id} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              The customer hasn&rsquo;t submitted their login yet — it appears here once they do.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

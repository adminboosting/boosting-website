import type { OrderMode, Rank, ServiceType } from "@/lib/catalog/types";
import { formatUsdFromCents } from "@/lib/money";
import type { OrderStatus } from "@/lib/orders/transitions";
import type {
  NetWinsConfig,
  PlacementsConfig,
  QuoteConfig,
  RankBoostConfig,
} from "@/lib/pricing/types";

/**
 * Deterministic order summary — AI feature "order_summary"
 * (lib/ai/features.ts). Pure template, no env, fast-suite tested. Wired as a
 * single line at the top of /admin/orders/[id] so an admin gets the gist
 * before scanning the sections.
 */

/** The order fields the template reads — callers map their row shape onto this. */
export interface OrderSummaryInput {
  gameName: string;
  serviceType: ServiceType;
  mode: OrderMode;
  status: OrderStatus;
  /** orders.config — the camelCase QuoteConfig persisted at checkout. */
  config: QuoteConfig;
  totalCents: number;
  /** ISO timestamp. */
  createdAt: string;
  /** This game's ranks (to resolve rank-index labels). Optional — omitting
      them degrades the descriptor to a generic "rank boost". */
  ranks?: readonly Rank[];
}

export interface OrderSummaryProgress {
  note: string | null;
  /** ISO timestamp. */
  createdAt: string;
}

const NOTE_MAX_CHARS = 80;

/** Compact relative age ("just now", "35m ago", "4h ago", "2d ago"). */
function formatAgo(iso: string, nowMs: number): string {
  const diffMs = nowMs - Date.parse(iso);
  if (!Number.isFinite(diffMs) || diffMs < 60_000) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** "Gold IV → Platinum II duo boost" / "5-game placements (piloted)" / "10 net wins (duo)". */
function describeService(order: OrderSummaryInput): string {
  switch (order.serviceType) {
    case "rank_boost": {
      const config = order.config as RankBoostConfig;
      const from = order.ranks?.find((r) => r.sortIndex === config.currentRankIndex)?.label;
      const to = order.ranks?.find((r) => r.sortIndex === config.desiredRankIndex)?.label;
      return from && to ? `${from} → ${to} ${order.mode} boost` : `${order.mode} rank boost`;
    }
    case "placements": {
      const config = order.config as PlacementsConfig;
      return `${config.gamesCount}-game placements (${order.mode})`;
    }
    case "net_wins": {
      const config = order.config as NetWinsConfig;
      return `${config.winsCount} net wins (${order.mode})`;
    }
  }
}

/**
 * One-line, deterministic order summary, e.g.:
 *
 *   "League of Legends — Gold IV → Platinum II duo boost · in progress ·
 *    $54.30 total · placed 4d ago · last update 2d ago (“Won 3 games”)."
 *
 * `nowMs` is an injectable clock for deterministic tests (defaults to now).
 */
export function summarizeOrder(
  order: OrderSummaryInput,
  latestProgress?: OrderSummaryProgress | null,
  nowMs: number = Date.now(),
): string {
  const statusLabel = order.status.replace(/_/g, " ");
  const parts = [
    `${order.gameName} — ${describeService(order)}`,
    statusLabel,
    `${formatUsdFromCents(order.totalCents)} total`,
    `placed ${formatAgo(order.createdAt, nowMs)}`,
  ];

  if (latestProgress) {
    const note = latestProgress.note?.trim();
    const truncated =
      note && note.length > NOTE_MAX_CHARS ? `${note.slice(0, NOTE_MAX_CHARS - 1)}…` : note;
    parts.push(
      `last update ${formatAgo(latestProgress.createdAt, nowMs)}${truncated ? ` (“${truncated}”)` : ""}`,
    );
  } else {
    parts.push("no progress updates yet");
  }

  return `${parts.join(" · ")}.`;
}

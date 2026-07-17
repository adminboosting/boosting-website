/**
 * Loyalty display helpers — pure functions over the static tier table
 * (lib/catalog/data.ts) so the account UI logic stays unit-testable. No
 * server-only imports; money is integer cents throughout.
 */
import { getLoyaltyTierForSpend, LOYALTY_TIERS } from "@/lib/catalog/data";
import type { LoyaltyTier } from "@/lib/catalog/types";

/** Mirrors the `loyalty_entry_kind` enum (supabase/migrations/0001_foundation.sql). */
export type LoyaltyLedgerKind = "earn" | "spend" | "adjust";

export interface LoyaltyProgress {
  /** The tier the spend currently qualifies for. */
  tier: LoyaltyTier;
  /** The next tier up, or null at the top tier. */
  nextTier: LoyaltyTier | null;
  /** Cents left to spend before reaching nextTier; 0 at the top tier. */
  remainingCents: number;
  /**
   * Whole-number 0–100 progress through the current tier's band (from this
   * tier's threshold to the next one's). 100 at the top tier.
   */
  progressPct: number;
}

/**
 * Where a lifetime spend sits on the loyalty ladder. Negative or non-finite
 * input is treated as zero spend (Bronze, no progress) rather than throwing —
 * the value comes from a DB column the UI should never crash on.
 */
export function getLoyaltyProgress(lifetimeSpendCents: number): LoyaltyProgress {
  const spend = Number.isFinite(lifetimeSpendCents) ? Math.max(0, lifetimeSpendCents) : 0;
  const tier = getLoyaltyTierForSpend(spend);
  // LOYALTY_TIERS is sorted ascending by threshold; the next tier is the
  // first one whose threshold the current tier's sits below.
  const index = LOYALTY_TIERS.findIndex(
    (t) => t.minLifetimeSpendCents === tier.minLifetimeSpendCents,
  );
  const nextTier = LOYALTY_TIERS[index + 1] ?? null;

  if (!nextTier) {
    return { tier, nextTier: null, remainingCents: 0, progressPct: 100 };
  }

  const bandCents = nextTier.minLifetimeSpendCents - tier.minLifetimeSpendCents;
  const intoBandCents = spend - tier.minLifetimeSpendCents;
  const rawPct = bandCents > 0 ? (intoBandCents / bandCents) * 100 : 0;
  return {
    tier,
    nextTier,
    remainingCents: Math.max(0, nextTier.minLifetimeSpendCents - spend),
    progressPct: Math.min(100, Math.max(0, Math.round(rawPct))),
  };
}

const LEDGER_KIND_LABELS: Record<LoyaltyLedgerKind, string> = {
  earn: "Credit earned",
  spend: "Credit spent",
  adjust: "Adjustment",
};

/** Human label for a loyalty_ledger `kind`; falls back to the raw value. */
export function describeLedgerKind(kind: string): string {
  return LEDGER_KIND_LABELS[kind as LoyaltyLedgerKind] ?? kind;
}

/** Basis points as a human percent string, e.g. 50 -> "0.5%", 200 -> "2%". */
export function formatBpAsPercent(bp: number): string {
  return `${bp / 100}%`;
}

import { applyBp, roundHalfUp } from "@/lib/money";
import type { Modifier, Rank, Region } from "@/lib/catalog/types";
import {
  PricingError,
  type NetWinsConfig,
  type PlacementsConfig,
  type PricingContext,
  type Quote,
  type QuoteInput,
  type QuoteLine,
  type RankBoostConfig,
} from "@/lib/pricing/types";

/**
 * The sole source of truth for money. Pure function: same inputs -> same output.
 * Both /api/quote and order creation call this; the client never computes price.
 *
 * Integer cents throughout, rounding half-up at each multiply.
 */
export function computeQuote(input: QuoteInput, ctx: PricingContext): Quote {
  const warnings: string[] = [];
  const lines: QuoteLine[] = [];
  const { settings } = ctx;
  const isLoL = ctx.game.slug === "league-of-legends";

  // --- Region (fall back to default on unknown code) -----------------------
  const region = resolveRegion(ctx.regions, input.regionCode, warnings);

  // --- 1. Base (pre-region) + base ETA by service --------------------------
  let baseBeforeRegion: number;
  let baseEtaHours: number;
  let baseLabel: string;

  switch (input.serviceType) {
    case "rank_boost": {
      const r = computeRankBoostBase(input.config as RankBoostConfig, ctx, isLoL);
      baseBeforeRegion = r.cents;
      baseEtaHours = r.etaHours;
      baseLabel = r.label;
      break;
    }
    case "placements": {
      const r = computePlacementsBase(input.config as PlacementsConfig, ctx);
      baseBeforeRegion = r.cents;
      baseEtaHours = r.etaHours;
      baseLabel = r.label;
      break;
    }
    case "net_wins": {
      const r = computeNetWinsBase(input.config as NetWinsConfig, ctx);
      baseBeforeRegion = r.cents;
      baseEtaHours = r.etaHours;
      baseLabel = r.label;
      break;
    }
    default:
      throw new PricingError("invalid_service", "Unknown service type.");
  }

  // --- 2. Region multiplier ------------------------------------------------
  let base = roundHalfUp(baseBeforeRegion * region.multiplier);

  // --- 3. Mode (duo uplift + ETA slowdown) ---------------------------------
  let etaMultiplier = 1;
  if (input.mode === "duo") {
    base = roundHalfUp(base * (1 + settings.duoMultiplierBp / 10000));
    etaMultiplier *= 1.25;
  }
  const baseCents = base;
  lines.push({ key: "base", label: baseLabel, amountCents: baseCents, kind: "base" });

  // --- 4. Modifiers (applied to post-mode base, in sort order) -------------
  const applicable = ctx.modifiers.filter(
    (m) =>
      m.isActive &&
      (m.gameSlug === null || m.gameSlug === ctx.game.slug) &&
      (m.serviceType === null || m.serviceType === input.serviceType),
  );
  for (const key of input.modifierKeys) {
    if (!applicable.some((m) => m.key === key)) {
      warnings.push(`Ignored unavailable option "${key}".`);
    }
  }
  const chosen = applicable
    .filter((m) => input.modifierKeys.includes(m.key))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  let modifiersCents = 0;
  for (const mod of chosen) {
    if (input.mode === "duo" && mod.hiddenInDuo) {
      warnings.push(`Option "${mod.label}" isn't available in duo mode.`);
      continue;
    }
    const amount = modifierAmount(mod, baseCents);
    modifiersCents += amount;
    etaMultiplier *= mod.etaMultiplier;
    lines.push({ key: mod.key, label: mod.label, amountCents: amount, kind: "modifier" });
  }

  // --- 5. Subtotal ---------------------------------------------------------
  const subtotal = baseCents + modifiersCents;

  // --- 6. Discounts (each computed on the ORIGINAL subtotal), capped -------
  const discounts = collectDiscounts(input, ctx, subtotal, warnings);
  const rawDiscount = discounts.reduce((sum, d) => sum + d.amount, 0);
  const discountCap = applyBp(subtotal, settings.maxTotalDiscountBp);
  const discountCents = Math.min(rawDiscount, discountCap);

  if (rawDiscount <= discountCap) {
    for (const d of discounts) {
      lines.push({ key: d.key, label: d.label, amountCents: -d.amount, kind: "discount" });
    }
  } else {
    lines.push({
      key: "discount_capped",
      label: `Discounts (capped at ${settings.maxTotalDiscountBp / 100}%)`,
      amountCents: -discountCents,
      kind: "discount",
    });
    warnings.push("Combined discounts exceeded the maximum and were capped.");
  }

  // --- 7. Pre-credit total -------------------------------------------------
  const preCreditTotal = Math.max(0, subtotal - discountCents);

  // --- 8. Store credit -----------------------------------------------------
  let storeCreditAppliedCents = 0;
  if (input.applyStoreCredit && ctx.account && ctx.account.storeCreditCents > 0) {
    storeCreditAppliedCents = Math.min(ctx.account.storeCreditCents, preCreditTotal);
    if (storeCreditAppliedCents > 0) {
      lines.push({
        key: "store_credit",
        label: "Store credit",
        amountCents: -storeCreditAppliedCents,
        kind: "credit",
      });
    }
  }
  const totalCents = preCreditTotal - storeCreditAppliedCents;

  // --- 9. Cashback preview (accrues on completion, on the pre-credit total) -
  const cashbackPreviewCents = ctx.account
    ? applyBp(preCreditTotal, ctx.account.loyaltyCashbackBp)
    : 0;

  // --- 10. ETA (rounded to nearest 0.5h) -----------------------------------
  const etaHours = Math.round(baseEtaHours * etaMultiplier * 2) / 2;

  return {
    baseCents,
    modifiersCents,
    discountCents,
    storeCreditAppliedCents,
    totalCents,
    etaHours,
    lines,
    cashbackPreviewCents,
    currency: "USD",
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRegion(regions: Region[], code: string, warnings: string[]): Region {
  const match = regions.find((r) => r.code === code);
  if (match) return match;
  const fallback = regions.find((r) => r.isDefault) ?? regions[0];
  if (!fallback) throw new PricingError("no_region", "No regions configured for this game.");
  if (code) warnings.push(`Unknown region "${code}"; used ${fallback.label}.`);
  return fallback;
}

function modifierAmount(mod: Modifier, baseCents: number): number {
  return mod.kind === "percent" ? applyBp(baseCents, mod.amount) : mod.amount;
}

function computeRankBoostBase(
  config: RankBoostConfig,
  ctx: PricingContext,
  isLoL: boolean,
): { cents: number; etaHours: number; label: string } {
  const current = ctx.ranks.find((r) => r.sortIndex === config.currentRankIndex);
  const desired = ctx.ranks.find((r) => r.sortIndex === config.desiredRankIndex);
  if (!current || !desired) {
    throw new PricingError("invalid_rank", "Unknown rank selection.");
  }
  if (config.desiredRankIndex <= config.currentRankIndex) {
    throw new PricingError("invalid_range", "Desired rank must be above your current rank.");
  }
  if (!desired.isPurchasable) {
    throw new PricingError(
      "not_purchasable",
      "That rank isn't available online — contact support for a custom quote.",
    );
  }

  const steps: Rank[] = ctx.ranks.filter(
    (r) => r.sortIndex > config.currentRankIndex && r.sortIndex <= config.desiredRankIndex,
  );
  if (steps.some((s) => !s.isPurchasable)) {
    throw new PricingError(
      "not_purchasable",
      "That climb passes a rank we don't sell online — contact support.",
    );
  }

  let cents = 0;
  let etaHours = 0;
  steps.forEach((step, i) => {
    let price = step.climbPriceCents;
    if (isLoL && i === 0) {
      const factor = ctx.settings.lolLpRules.proration[config.currentLpBand ?? 0] ?? 1;
      price = roundHalfUp(price * factor);
    }
    cents += price;
    etaHours += step.climbEtaHours;
  });

  if (isLoL && config.lpGainBand === "low") {
    cents = roundHalfUp(cents * (1 + ctx.settings.lolLpRules.lowGainSurchargeBp / 10000));
  }
  if (isLoL && config.queue === "flex") {
    cents = roundHalfUp(cents * ctx.settings.lolLpRules.flexMultiplier);
  }

  return { cents, etaHours, label: `${current.label} → ${desired.label}` };
}

function computePlacementsBase(
  config: PlacementsConfig,
  ctx: PricingContext,
): { cents: number; etaHours: number; label: string } {
  const price = ctx.placementPrices.find((p) => p.band === config.previousBand);
  if (!price) {
    throw new PricingError("invalid_band", "Unknown placement band.");
  }
  if (!Number.isInteger(config.gamesCount) || config.gamesCount < price.minGames || config.gamesCount > price.maxGames) {
    throw new PricingError(
      "invalid_games",
      `Choose between ${price.minGames} and ${price.maxGames} placement games.`,
    );
  }
  return {
    cents: price.pricePerGameCents * config.gamesCount,
    etaHours: config.gamesCount * price.etaPerGameHours,
    label: `${config.gamesCount} placement games (${price.label})`,
  };
}

function computeNetWinsBase(
  config: NetWinsConfig,
  ctx: PricingContext,
): { cents: number; etaHours: number; label: string } {
  if (!Number.isInteger(config.winsCount) || config.winsCount < 1 || config.winsCount > 10) {
    throw new PricingError("invalid_wins", "Choose between 1 and 10 net wins.");
  }
  const currentRank = ctx.ranks.find((r) => r.sortIndex === config.currentRankIndex);
  if (!currentRank) {
    throw new PricingError("invalid_rank", "Unknown current rank.");
  }
  const group = ctx.netWinGroups.find((g) => g.tiers.includes(currentRank.tier));
  if (!group) {
    throw new PricingError("invalid_group", "No net-win pricing for this rank.");
  }
  return {
    cents: group.pricePerWinCents * config.winsCount,
    etaHours: config.winsCount * group.etaPerWinHours,
    label: `${config.winsCount} net wins (${currentRank.tier})`,
  };
}

interface DiscountEntry {
  key: string;
  label: string;
  amount: number;
}

function collectDiscounts(
  input: QuoteInput,
  ctx: PricingContext,
  subtotal: number,
  warnings: string[],
): DiscountEntry[] {
  const discounts: DiscountEntry[] = [];

  // (a) Loyalty
  if (ctx.account && ctx.account.loyaltyDiscountBp > 0) {
    const amount = applyBp(subtotal, ctx.account.loyaltyDiscountBp);
    if (amount > 0) discounts.push({ key: "loyalty", label: "Loyalty discount", amount });
  }

  // (b) Coupon
  if (input.couponCode) {
    const coupon = ctx.coupon;
    const now = ctx.nowMs ?? Date.now();
    if (!coupon || !coupon.isActive) {
      warnings.push("That coupon code isn't valid.");
    } else if (coupon.expiresAt && Date.parse(coupon.expiresAt) < now) {
      warnings.push("That coupon has expired.");
    } else if (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) {
      warnings.push("That coupon has been fully redeemed.");
    } else if (subtotal < coupon.minOrderCents) {
      warnings.push("Your order doesn't meet this coupon's minimum.");
    } else {
      const raw = coupon.kind === "percent" ? applyBp(subtotal, coupon.amount) : coupon.amount;
      const amount = Math.min(raw, subtotal);
      if (amount > 0) discounts.push({ key: "coupon", label: `Coupon ${coupon.code}`, amount });
    }
  }

  // (c) Volume (highest qualifying band)
  const band = ctx.settings.volumeDiscounts
    .filter((b) => subtotal >= b.minCents)
    .sort((a, b) => b.bp - a.bp)[0];
  if (band) {
    const amount = applyBp(subtotal, band.bp);
    if (amount > 0) discounts.push({ key: "volume", label: "Volume discount", amount });
  }

  return discounts;
}

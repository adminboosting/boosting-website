import { beforeEach, describe, expect, it } from "vitest";
import { type BuildContextOptions, buildPricingContext, getRanks } from "@/lib/catalog/data";
import { computeQuote } from "@/lib/pricing/engine";
import { PricingError, type Quote, type QuoteInput } from "@/lib/pricing/types";
import type { AccountPricingContext, GameSlug } from "@/lib/catalog/types";

/** Resolve a rank's sortIndex by its label, e.g. idx("valorant", "Gold 2"). */
function idx(game: GameSlug, label: string): number {
  const rank = getRanks(game).find((r) => r.label === label);
  if (!rank) throw new Error(`No rank "${label}" in ${game}`);
  return rank.sortIndex;
}

/**
 * Compute a quote from a static context. A coupon code passed via opts is
 * threaded into both the input (so the engine applies it) and the context (so it
 * resolves) — mirroring how /api/quote wires a single request.
 */
function quote(input: QuoteInput, opts: BuildContextOptions = {}): Quote {
  const couponCode = opts.couponCode ?? input.couponCode;
  const mergedInput: QuoteInput = { ...input, couponCode };
  return computeQuote(
    mergedInput,
    buildPricingContext(input.gameSlug, input.serviceType, { ...opts, couponCode }),
  );
}

/** Invariant: itemized lines always sum to the charged total. */
function expectLinesReconcile(q: Quote): void {
  const sum = q.lines.reduce((s, l) => s + l.amountCents, 0);
  expect(sum).toBe(q.totalCents);
}

// A base rank-boost input; override per test.
function rankBoost(
  game: GameSlug,
  currentRankIndex: number,
  desiredRankIndex: number,
  overrides: Partial<QuoteInput> = {},
  configOverrides: Record<string, unknown> = {},
): QuoteInput {
  return {
    gameSlug: game,
    serviceType: "rank_boost",
    mode: "piloted",
    regionCode: defaultRegion(game),
    modifierKeys: [],
    config: { currentRankIndex, desiredRankIndex, ...configOverrides },
    ...overrides,
  };
}

function defaultRegion(game: GameSlug): string {
  return game === "valorant" ? "na" : game === "league-of-legends" ? "na" : "americas";
}

describe("rank boost — base by game", () => {
  it("LoL: Silver I -> Gold IV uses the destination tier price ($18.00)", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold IV")));
    expect(q.baseCents).toBe(1800);
    expect(q.totalCents).toBe(1800);
    expect(q.etaHours).toBe(3.5);
    expectLinesReconcile(q);
  });

  it("LoL: single-tier climb Gold IV -> Gold I (3 divisions)", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Gold IV"), idx("league-of-legends", "Gold I")));
    expect(q.baseCents).toBe(5400); // 3 x 1800
    expect(q.etaHours).toBe(10.5); // 3 x 3.5
  });

  it("LoL: cross-tier Gold IV -> Platinum IV", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Gold IV"), idx("league-of-legends", "Platinum IV")));
    // Gold III+II+I (3x1800) + Plat IV (2600)
    expect(q.baseCents).toBe(8000);
    expect(q.etaHours).toBe(15); // 3x3.5 + 4.5
  });

  it("Valorant: Gold 1 -> Gold 2 ($16.00)", () => {
    const q = quote(rankBoost("valorant", idx("valorant", "Gold 1"), idx("valorant", "Gold 2")));
    expect(q.baseCents).toBe(1600);
  });

  it("Overwatch 2: Bronze 5 -> Bronze 4 ($9.00)", () => {
    const q = quote(rankBoost("overwatch-2", idx("overwatch-2", "Bronze 5"), idx("overwatch-2", "Bronze 4")));
    expect(q.baseCents).toBe(900);
  });

  it("Marvel Rivals: Gold III -> Gold II ($12.00)", () => {
    const q = quote(rankBoost("marvel-rivals", idx("marvel-rivals", "Gold III"), idx("marvel-rivals", "Gold II")));
    expect(q.baseCents).toBe(1200);
  });
});

describe("regions", () => {
  it("applies the KR multiplier (1.40) on LoL", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold IV"), { regionCode: "kr" }));
    expect(q.baseCents).toBe(2520); // 1800 * 1.4
  });

  it("applies the BR/LATAM multiplier (0.85) on LoL", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Silver IV"), idx("league-of-legends", "Silver III"), { regionCode: "br_latam" }));
    expect(q.baseCents).toBe(1020); // 1200 * 0.85
  });

  it("falls back to the default region on an unknown code, with a warning", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold IV"), { regionCode: "atlantis" }));
    expect(q.baseCents).toBe(1800); // NA default 1.0
    expect(q.warnings.some((w) => w.includes("atlantis"))).toBe(true);
  });
});

describe("mode", () => {
  it("duo adds +90% and slows ETA x1.25", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold IV"), { mode: "duo" }));
    expect(q.baseCents).toBe(3420); // 1800 * 1.9
    expect(q.etaHours).toBe(4.5); // 3.5 * 1.25 = 4.375 -> 4.5
    expectLinesReconcile(q);
  });
});

describe("modifiers", () => {
  it("express adds +20% and speeds ETA x0.8", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold IV"), { modifierKeys: ["express"] }));
    expect(q.modifiersCents).toBe(360);
    expect(q.totalCents).toBe(2160);
    expect(q.etaHours).toBe(3); // 3.5 * 0.8 = 2.8 -> 3.0
    expectLinesReconcile(q);
  });

  it("stacks percent modifiers, each computed on the post-mode base", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold IV"), { modifierKeys: ["express", "stream"] }));
    expect(q.modifiersCents).toBe(630); // 360 + 270 (15% of 1800)
    expect(q.totalCents).toBe(2430);
  });

  it("rounds a fractional modifier half-up (Val Silver1->Silver2 @AP + stream)", () => {
    const q = quote(rankBoost("valorant", idx("valorant", "Silver 1"), idx("valorant", "Silver 2"), { regionCode: "ap", modifierKeys: ["stream"] }));
    expect(q.baseCents).toBe(1365); // 1300 * 1.05
    expect(q.modifiersCents).toBe(205); // 204.75 -> 205
    expect(q.totalCents).toBe(1570);
  });

  it("flat $0 options (solo queue) change ETA but not price", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold IV"), { modifierKeys: ["solo_queue_only"] }));
    expect(q.modifiersCents).toBe(0);
    expect(q.etaHours).toBe(4); // 3.5 * 1.15 = 4.025 -> 4.0
  });

  it("warns and ignores an unknown modifier key", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold IV"), { modifierKeys: ["teleport"] }));
    expect(q.modifiersCents).toBe(0);
    expect(q.warnings.some((w) => w.includes("teleport"))).toBe(true);
  });

  it("hides piloted-only options in duo mode with a warning", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold IV"), { mode: "duo", modifierKeys: ["appear_offline"] }));
    expect(q.baseCents).toBe(3420);
    expect(q.modifiersCents).toBe(0);
    expect(q.warnings.some((w) => w.toLowerCase().includes("duo"))).toBe(true);
  });
});

describe("LoL LP proration + gain + queue", () => {
  it("prorates the first step by current LP band (50 -> x0.60)", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold IV"), {}, { currentLpBand: 50 }));
    expect(q.baseCents).toBe(1080); // 1800 * 0.6
  });

  it("prorates only the FIRST step in a multi-step climb", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold II"), {}, { currentLpBand: 50 }));
    // Gold IV (1800*0.6=1080) + Gold III (1800) + Gold II (1800)
    expect(q.baseCents).toBe(4680);
  });

  it("adds +20% for a low LP-gain account", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold IV"), {}, { lpGainBand: "low" }));
    expect(q.baseCents).toBe(2160); // 1800 * 1.2
  });

  it("applies the Flex queue multiplier (x0.90)", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold IV"), {}, { queue: "flex" }));
    expect(q.baseCents).toBe(1620); // 1800 * 0.9
  });

  it("ignores LP fields for non-LoL games", () => {
    const q = quote(rankBoost("valorant", idx("valorant", "Gold 1"), idx("valorant", "Gold 2"), {}, { currentLpBand: 50, lpGainBand: "low", queue: "flex" }));
    expect(q.baseCents).toBe(1600); // unchanged
  });
});

describe("discounts: coupon, loyalty, volume, cap", () => {
  const account = (over: Partial<AccountPricingContext> = {}): AccountPricingContext => ({
    loyaltyDiscountBp: 0,
    loyaltyCashbackBp: 0,
    storeCreditCents: 0,
    ...over,
  });

  it("applies WELCOME10 (10%) above the $20 minimum", () => {
    const q = quote(
      rankBoost("league-of-legends", idx("league-of-legends", "Gold IV"), idx("league-of-legends", "Platinum IV")),
      { couponCode: "WELCOME10" },
    );
    expect(q.baseCents).toBe(8000);
    expect(q.discountCents).toBe(800);
    expect(q.totalCents).toBe(7200);
    expectLinesReconcile(q);
  });

  it("rejects WELCOME10 below the minimum, with a warning", () => {
    const q = quote(
      rankBoost("league-of-legends", idx("league-of-legends", "Iron IV"), idx("league-of-legends", "Iron III")),
      { couponCode: "WELCOME10" },
    );
    expect(q.discountCents).toBe(0);
    expect(q.totalCents).toBe(600);
    expect(q.warnings.length).toBeGreaterThan(0);
  });

  it("warns on an unknown coupon and applies nothing", () => {
    const q = quote(
      rankBoost("league-of-legends", idx("league-of-legends", "Gold IV"), idx("league-of-legends", "Platinum IV")),
      { couponCode: "NOPE" },
    );
    expect(q.discountCents).toBe(0);
    expect(q.warnings.length).toBeGreaterThan(0);
  });

  it("applies the highest qualifying volume band (300bp at $100+)", () => {
    const q = quote(rankBoost("league-of-legends", idx("league-of-legends", "Gold IV"), idx("league-of-legends", "Platinum I")));
    expect(q.baseCents).toBe(15800);
    expect(q.discountCents).toBe(474); // 3% of 15800
  });

  it("stacks loyalty + coupon + volume and clamps to the 30% cap", () => {
    const q = quote(
      rankBoost("league-of-legends", idx("league-of-legends", "Gold IV"), idx("league-of-legends", "Emerald II")),
      { couponCode: "WELCOME10", account: account({ loyaltyDiscountBp: 1800, loyaltyCashbackBp: 250 }) },
    );
    expect(q.baseCents).toBe(27200);
    // loyalty 4896 + coupon 2720 + volume 1360 = 8976, capped at 30% (8160)
    expect(q.discountCents).toBe(8160);
    expect(q.totalCents).toBe(19040);
    expect(q.cashbackPreviewCents).toBe(476); // 2.5% of pre-credit 19040
    expectLinesReconcile(q);
  });
});

describe("store credit", () => {
  const acct = (credit: number, over = {}): AccountPricingContext => ({
    loyaltyDiscountBp: 0,
    loyaltyCashbackBp: 0,
    storeCreditCents: credit,
    ...over,
  });

  it("clamps applied credit to the pre-credit total (never negative)", () => {
    const q = quote(
      rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold IV"), { applyStoreCredit: true }),
      { account: acct(1850) },
    );
    expect(q.storeCreditAppliedCents).toBe(1800);
    expect(q.totalCents).toBe(0);
    expectLinesReconcile(q);
  });

  it("applies partial credit", () => {
    const q = quote(
      rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold IV"), { applyStoreCredit: true }),
      { account: acct(500) },
    );
    expect(q.storeCreditAppliedCents).toBe(500);
    expect(q.totalCents).toBe(1300);
  });

  it("does not apply credit unless applyStoreCredit is set", () => {
    const q = quote(
      rankBoost("league-of-legends", idx("league-of-legends", "Silver I"), idx("league-of-legends", "Gold IV")),
      { account: acct(1850) },
    );
    expect(q.storeCreditAppliedCents).toBe(0);
    expect(q.totalCents).toBe(1800);
  });
});

describe("placements", () => {
  it("prices per game and enforces ETA", () => {
    const q = quote({
      gameSlug: "league-of-legends",
      serviceType: "placements",
      mode: "piloted",
      regionCode: "na",
      modifierKeys: [],
      config: { gamesCount: 5, previousBand: "unranked_low" },
    });
    expect(q.baseCents).toBe(3000); // 5 x 600
    expect(q.etaHours).toBe(4); // 5 x 0.8
  });

  it("rejects a games count above the max", () => {
    expect(() =>
      quote({
        gameSlug: "league-of-legends",
        serviceType: "placements",
        mode: "piloted",
        regionCode: "na",
        modifierKeys: [],
        config: { gamesCount: 6, previousBand: "unranked_low" },
      }),
    ).toThrow(PricingError);
  });
});

describe("net wins", () => {
  it("prices per win by the current tier's group (Gold -> mid)", () => {
    const q = quote({
      gameSlug: "league-of-legends",
      serviceType: "net_wins",
      mode: "piloted",
      regionCode: "na",
      modifierKeys: [],
      config: { winsCount: 5, currentRankIndex: idx("league-of-legends", "Gold IV") },
    });
    expect(q.baseCents).toBe(4000); // 5 x 800
    expect(q.etaHours).toBe(3.5); // 5 x 0.7
  });

  it("prices elite tiers (Master -> elite $28/win)", () => {
    const q = quote({
      gameSlug: "league-of-legends",
      serviceType: "net_wins",
      mode: "piloted",
      regionCode: "na",
      modifierKeys: [],
      config: { winsCount: 3, currentRankIndex: idx("league-of-legends", "Master") },
    });
    expect(q.baseCents).toBe(8400); // 3 x 2800
  });

  it("rejects an out-of-range wins count", () => {
    expect(() =>
      quote({
        gameSlug: "league-of-legends",
        serviceType: "net_wins",
        mode: "piloted",
        regionCode: "na",
        modifierKeys: [],
        config: { winsCount: 11, currentRankIndex: idx("league-of-legends", "Gold IV") },
      }),
    ).toThrow(PricingError);
  });
});

describe("rejections", () => {
  it("rejects desired <= current", () => {
    expect(() =>
      quote(rankBoost("league-of-legends", idx("league-of-legends", "Gold I"), idx("league-of-legends", "Gold IV"))),
    ).toThrow(PricingError);
  });

  it("rejects a non-purchasable desired rank (contact us)", () => {
    expect(() =>
      quote(rankBoost("league-of-legends", idx("league-of-legends", "Diamond I"), idx("league-of-legends", "Master"))),
    ).toThrow(PricingError);
  });

  it("rejects a non-purchasable desired rank in Valorant (Immortal)", () => {
    expect(() =>
      quote(rankBoost("valorant", idx("valorant", "Ascendant 3"), idx("valorant", "Immortal"))),
    ).toThrow(PricingError);
  });
});

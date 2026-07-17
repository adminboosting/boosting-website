import { describe, expect, it } from "vitest";
import { LOYALTY_TIERS } from "@/lib/catalog/data";
import { describeLedgerKind, formatBpAsPercent, getLoyaltyProgress } from "@/lib/loyalty/view";

describe("getLoyaltyProgress", () => {
  it("resolves exact tier boundaries (14999 stays Bronze, 15000 is Silver)", () => {
    expect(getLoyaltyProgress(14_999).tier.name).toBe("Bronze");
    expect(getLoyaltyProgress(15_000).tier.name).toBe("Silver");
    expect(getLoyaltyProgress(39_999).tier.name).toBe("Silver");
    expect(getLoyaltyProgress(40_000).tier.name).toBe("Gold");
    expect(getLoyaltyProgress(75_000).tier.name).toBe("Platinum");
    expect(getLoyaltyProgress(100_000).tier.name).toBe("Diamond");
  });

  it("points nextTier at the following rung with the right remainder", () => {
    const bronze = getLoyaltyProgress(0);
    expect(bronze.nextTier?.name).toBe("Silver");
    expect(bronze.remainingCents).toBe(15_000);
    expect(bronze.progressPct).toBe(0);

    const silver = getLoyaltyProgress(15_000);
    expect(silver.nextTier?.name).toBe("Gold");
    expect(silver.remainingCents).toBe(25_000);
    expect(silver.progressPct).toBe(0);
  });

  it("reports mid-band progress as a whole percent", () => {
    // Halfway through Bronze's 0–15000 band.
    const halfway = getLoyaltyProgress(7_500);
    expect(halfway.tier.name).toBe("Bronze");
    expect(halfway.progressPct).toBe(50);
    expect(halfway.remainingCents).toBe(7_500);

    // 14999/15000 rounds to 100 but must never overshoot the clamp.
    const brink = getLoyaltyProgress(14_999);
    expect(brink.progressPct).toBeLessThanOrEqual(100);
    expect(brink.remainingCents).toBe(1);
  });

  it("caps Diamond with nextTier null, zero remaining, 100%", () => {
    for (const spend of [100_000, 250_000, Number.MAX_SAFE_INTEGER]) {
      const top = getLoyaltyProgress(spend);
      expect(top.tier.name).toBe("Diamond");
      expect(top.nextTier).toBeNull();
      expect(top.remainingCents).toBe(0);
      expect(top.progressPct).toBe(100);
    }
  });

  it("clamps hostile input to zero spend instead of throwing", () => {
    for (const spend of [-1, -100_000, Number.NaN, Number.POSITIVE_INFINITY * -1]) {
      const result = getLoyaltyProgress(spend);
      expect(result.tier.name).toBe("Bronze");
      expect(result.progressPct).toBe(0);
      expect(result.remainingCents).toBe(15_000);
    }
    // NaN spend also lands on Bronze at zero progress.
    expect(getLoyaltyProgress(Number.NaN).progressPct).toBe(0);
  });

  it("progressPct stays within 0–100 across the whole ladder", () => {
    for (let spend = 0; spend <= 120_000; spend += 1_037) {
      const { progressPct } = getLoyaltyProgress(spend);
      expect(progressPct).toBeGreaterThanOrEqual(0);
      expect(progressPct).toBeLessThanOrEqual(100);
      expect(Number.isInteger(progressPct)).toBe(true);
    }
  });

  it("returns tier objects from the canonical LOYALTY_TIERS table", () => {
    const { tier, nextTier } = getLoyaltyProgress(15_000);
    expect(LOYALTY_TIERS).toContain(tier);
    expect(LOYALTY_TIERS).toContain(nextTier);
  });
});

describe("describeLedgerKind", () => {
  it("labels the three ledger kinds", () => {
    expect(describeLedgerKind("earn")).toBe("Credit earned");
    expect(describeLedgerKind("spend")).toBe("Credit spent");
    expect(describeLedgerKind("adjust")).toBe("Adjustment");
  });

  it("falls back to the raw value for unknown kinds", () => {
    expect(describeLedgerKind("mystery")).toBe("mystery");
  });
});

describe("formatBpAsPercent", () => {
  it("renders basis points as human percents", () => {
    expect(formatBpAsPercent(50)).toBe("0.5%");
    expect(formatBpAsPercent(200)).toBe("2%");
    expect(formatBpAsPercent(1800)).toBe("18%");
  });
});

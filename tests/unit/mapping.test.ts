import { describe, expect, it } from "vitest";
import {
  camelToSnake,
  keysToCamel,
  keysToSnake,
  objectToRow,
  rowToObject,
  snakeToCamel,
} from "@/lib/catalog/mapping";

describe("key-case conversion", () => {
  it("converts single keys both ways", () => {
    expect(snakeToCamel("current_rank_index")).toBe("currentRankIndex");
    expect(snakeToCamel("id")).toBe("id");
    expect(snakeToCamel("price_per_game_cents")).toBe("pricePerGameCents");
    expect(camelToSnake("currentRankIndex")).toBe("current_rank_index");
    expect(camelToSnake("id")).toBe("id");
    expect(camelToSnake("pricePerGameCents")).toBe("price_per_game_cents");
  });
});

describe("keysToCamel", () => {
  it("deeply converts a DB row, including nested objects and arrays", () => {
    const row = {
      game_slug: "valorant",
      divisions_per_tier: 3,
      is_active: true,
      expires_at: null,
      volume_discounts: [
        { min_cents: 10000, bp: 300 },
        { min_cents: 20000, bp: 500 },
      ],
      lol_lp_rules: { low_gain_surcharge_bp: 2000 },
    };
    expect(keysToCamel(row)).toEqual({
      gameSlug: "valorant",
      divisionsPerTier: 3,
      isActive: true,
      expiresAt: null,
      volumeDiscounts: [
        { minCents: 10000, bp: 300 },
        { minCents: 20000, bp: 500 },
      ],
      lolLpRules: { lowGainSurchargeBp: 2000 },
    });
  });

  it("preserves the `config` jsonb value verbatim (stays camelCase)", () => {
    const row = {
      order_id: "abc",
      service_type: "rank_boost",
      config: { currentRankIndex: 3, desiredRankIndex: 7, nested: { keepMe: 1 } },
    };
    expect(keysToCamel(row)).toEqual({
      orderId: "abc",
      serviceType: "rank_boost",
      config: { currentRankIndex: 3, desiredRankIndex: 7, nested: { keepMe: 1 } },
    });
  });

  it("leaves Date values untouched", () => {
    const d = new Date("2026-01-01T00:00:00.000Z");
    expect(keysToCamel({ created_at: d })).toEqual({ createdAt: d });
  });
});

describe("keysToSnake", () => {
  it("deeply converts an app object back to a DB row", () => {
    const object = {
      gameSlug: "valorant",
      volumeDiscounts: [{ minCents: 10000, bp: 300 }],
    };
    expect(keysToSnake(object)).toEqual({
      game_slug: "valorant",
      volume_discounts: [{ min_cents: 10000, bp: 300 }],
    });
  });

  it("keeps the `config` jsonb camelCase when writing to a row", () => {
    const object = {
      orderId: "abc",
      config: { currentRankIndex: 3, desiredRankIndex: 7 },
    };
    expect(objectToRow(object)).toEqual({
      order_id: "abc",
      config: { currentRankIndex: 3, desiredRankIndex: 7 },
    });
  });
});

describe("round-trip", () => {
  it("row -> object -> row is identity for realistic columns", () => {
    const row = {
      id: "o1",
      game_slug: "league-of-legends",
      service_type: "rank_boost",
      total_cents: 4599,
      is_purchasable: true,
      config: { currentRankIndex: 2, desiredRankIndex: 9, mode: "piloted" },
      created_at: null,
    };
    expect(objectToRow(rowToObject(row))).toEqual(row);
  });
});

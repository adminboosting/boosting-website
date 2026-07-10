import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createSqlCatalogSource } from "@/lib/catalog/db-source";
import { fileCatalogSource, type CatalogSource } from "@/lib/catalog/source";
import { computeQuote } from "@/lib/pricing/engine";
import { PricingError, type QuoteInput } from "@/lib/pricing/types";
import { bootstrapDb } from "./helpers/bootstrap";

/**
 * Gate B price parity: the DB path (schema + generated seed + mappers + assembly
 * + engine) must produce quotes byte-identical to the file source, so cutting the
 * calculator over to the database cannot change any price. Drives the SQL catalog
 * source against PGlite loaded with the real supabase/seed.sql.
 */
const NOW = Date.UTC(2026, 0, 1);

const INPUTS: QuoteInput[] = [
  {
    gameSlug: "league-of-legends",
    serviceType: "rank_boost",
    mode: "piloted",
    regionCode: "na",
    config: { currentRankIndex: 1, desiredRankIndex: 8 },
    modifierKeys: [],
  },
  {
    gameSlug: "league-of-legends",
    serviceType: "rank_boost",
    mode: "piloted",
    regionCode: "kr",
    config: {
      currentRankIndex: 0,
      desiredRankIndex: 10,
      currentLpBand: 25,
      lpGainBand: "low",
      queue: "flex",
    },
    modifierKeys: ["express", "pick_characters"],
    couponCode: "WELCOME10",
  },
  {
    gameSlug: "valorant",
    serviceType: "rank_boost",
    mode: "duo",
    regionCode: "eu",
    config: { currentRankIndex: 2, desiredRankIndex: 9 },
    modifierKeys: ["express"],
  },
  {
    gameSlug: "overwatch-2",
    serviceType: "rank_boost",
    mode: "piloted",
    regionCode: "asia",
    config: { currentRankIndex: 3, desiredRankIndex: 12 },
    modifierKeys: ["priority_booster"],
  },
  {
    gameSlug: "marvel-rivals",
    serviceType: "rank_boost",
    mode: "piloted",
    regionCode: "americas",
    config: { currentRankIndex: 1, desiredRankIndex: 7 },
    modifierKeys: [],
  },
  {
    gameSlug: "valorant",
    serviceType: "placements",
    mode: "piloted",
    regionCode: "na",
    config: { gamesCount: 5, previousBand: "mid" },
    modifierKeys: [],
  },
  {
    gameSlug: "overwatch-2",
    serviceType: "placements",
    mode: "piloted",
    regionCode: "europe",
    config: { gamesCount: 8, previousBand: "high" },
    modifierKeys: ["express"],
  },
  {
    gameSlug: "league-of-legends",
    serviceType: "net_wins",
    mode: "piloted",
    regionCode: "na",
    config: { winsCount: 5, currentRankIndex: 6 },
    modifierKeys: [],
  },
  {
    gameSlug: "marvel-rivals",
    serviceType: "net_wins",
    mode: "piloted",
    regionCode: "asia",
    config: { winsCount: 10, currentRankIndex: 4 },
    modifierKeys: [],
  },
];

let db: PGlite;
let dbSource: CatalogSource;

async function quoteVia(source: CatalogSource, input: QuoteInput) {
  const ctx = await source.getPricingContext(input.gameSlug, input.serviceType, {
    couponCode: input.couponCode,
    account: null,
    nowMs: NOW,
  });
  try {
    return { ok: true as const, quote: computeQuote(input, ctx) };
  } catch (error) {
    if (error instanceof PricingError) return { ok: false as const, code: error.code };
    throw error;
  }
}

beforeAll(async () => {
  db = await bootstrapDb();
  const seed = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
  await db.exec(seed);
  dbSource = createSqlCatalogSource({
    query: (sql, params) => db.query(sql, params as unknown[] | undefined),
  });
});

afterAll(async () => {
  await db?.close();
});

describe("DB vs file price parity", () => {
  it.each(INPUTS)("$gameSlug/$serviceType/$mode matches the file source exactly", async (input) => {
    const [fromFile, fromDb] = await Promise.all([
      quoteVia(fileCatalogSource, input),
      quoteVia(dbSource, input),
    ]);
    // Same outcome (both a quote, or both the same rejection code) and,
    // when a quote, byte-identical.
    expect(fromDb).toEqual(fromFile);
  });

  it("re-applying the seed is idempotent (no duplicate-key errors)", async () => {
    const seed = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
    await expect(db.exec(seed)).resolves.toBeDefined();
    const games = await db.query<{ n: string }>("select count(*)::text as n from public.games");
    expect(games.rows[0]!.n).toBe("4");
  });
});

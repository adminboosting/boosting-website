/**
 * Single catalog data-access layer (spec A5/B3).
 *
 * This is the ONLY module the calculator and marketing pages read catalog data
 * through: games, ranks, prices, modifiers, regions, coupons, and pricing
 * settings. Nothing else imports `lib/catalog/data.ts` directly — the rest of the
 * app must not know where the catalog comes from.
 *
 * Source selection (B3):
 *   - Supabase configured (URL + service-role key present)  -> DB source
 *     (supabase-js), with the file source as a per-call fallback if a read fails.
 *   - Otherwise (local dev / no DB)                          -> file source.
 * The DB backend is dynamically imported only when configured, so `server-only`
 * and supabase-js never enter a file-mode bundle or the test graph.
 *
 * Getters are async: the DB read is async, and the price-parity regression test
 * (Gate B) guarantees the DB source returns values byte-identical to the file
 * source — so cutting over cannot change any price.
 */
import type {
  CouponRecord,
  Game,
  GameSlug,
  Modifier,
  NetWinGroup,
  PlacementPrice,
  PricingSettings,
  Rank,
  Region,
  ServiceType,
} from "@/lib/catalog/types";
import type { PricingContext } from "@/lib/pricing/types";
import {
  DEFAULT_PRICING_SETTINGS,
  GAMES,
  buildPricingContext,
  getCoupon as fileGetCoupon,
  getGame as fileGetGame,
  getModifiers as fileGetModifiers,
  getNetWinGroups as fileGetNetWinGroups,
  getPlacementPrices as fileGetPlacementPrices,
  getRanks as fileGetRanks,
  getRegions as fileGetRegions,
  type BuildContextOptions,
} from "@/lib/catalog/data";

export type { BuildContextOptions };

/** The contract every catalog backend implements. */
export interface CatalogSource {
  readonly kind: "file" | "database";
  getGames(): Promise<Game[]>;
  getGame(slug: GameSlug): Promise<Game>;
  getRanks(slug: GameSlug): Promise<Rank[]>;
  getPlacementPrices(slug: GameSlug): Promise<PlacementPrice[]>;
  getNetWinGroups(slug: GameSlug): Promise<NetWinGroup[]>;
  getRegions(slug: GameSlug): Promise<Region[]>;
  getModifiers(): Promise<Modifier[]>;
  getCoupon(code: string | undefined): Promise<CouponRecord | null>;
  getPricingSettings(): Promise<PricingSettings>;
  getPricingContext(
    gameSlug: GameSlug,
    serviceType: ServiceType,
    options?: BuildContextOptions,
  ): Promise<PricingContext>;
}

/** File-backed catalog source — delegates to the in-code catalog (`./data`). */
export const fileCatalogSource: CatalogSource = {
  kind: "file",
  getGames: async () => GAMES,
  getGame: async (slug) => fileGetGame(slug),
  getRanks: async (slug) => fileGetRanks(slug),
  getPlacementPrices: async (slug) => fileGetPlacementPrices(slug),
  getNetWinGroups: async (slug) => fileGetNetWinGroups(slug),
  getRegions: async (slug) => fileGetRegions(slug),
  getModifiers: async () => fileGetModifiers(),
  getCoupon: async (code) => fileGetCoupon(code),
  getPricingSettings: async () => DEFAULT_PRICING_SETTINGS,
  getPricingContext: async (gameSlug, serviceType, options) =>
    buildPricingContext(gameSlug, serviceType, options),
};

/**
 * Wrap a primary (DB) source so any failing read falls back to the file source.
 * This keeps the public site up if the database hiccups; the parity test proves
 * the two return identical values, so the fallback can only ever change latency.
 */
export function withFileFallback(primary: CatalogSource, fallback: CatalogSource): CatalogSource {
  let warned = false;
  const guard = async <T>(run: () => Promise<T>, fb: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      if (!warned) {
        warned = true;
        console.error(
          "[catalog] DB read failed — falling back to the file catalog:",
          error instanceof Error ? error.message : error,
        );
      }
      return fb();
    }
  };
  return {
    kind: "database",
    getGames: () =>
      guard(
        () => primary.getGames(),
        () => fallback.getGames(),
      ),
    getGame: (s) =>
      guard(
        () => primary.getGame(s),
        () => fallback.getGame(s),
      ),
    getRanks: (s) =>
      guard(
        () => primary.getRanks(s),
        () => fallback.getRanks(s),
      ),
    getPlacementPrices: (s) =>
      guard(
        () => primary.getPlacementPrices(s),
        () => fallback.getPlacementPrices(s),
      ),
    getNetWinGroups: (s) =>
      guard(
        () => primary.getNetWinGroups(s),
        () => fallback.getNetWinGroups(s),
      ),
    getRegions: (s) =>
      guard(
        () => primary.getRegions(s),
        () => fallback.getRegions(s),
      ),
    getModifiers: () =>
      guard(
        () => primary.getModifiers(),
        () => fallback.getModifiers(),
      ),
    getCoupon: (c) =>
      guard(
        () => primary.getCoupon(c),
        () => fallback.getCoupon(c),
      ),
    getPricingSettings: () =>
      guard(
        () => primary.getPricingSettings(),
        () => fallback.getPricingSettings(),
      ),
    getPricingContext: (g, s, o) =>
      guard(
        () => primary.getPricingContext(g, s, o),
        () => fallback.getPricingContext(g, s, o),
      ),
  };
}

function isDbConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return (
    !!url &&
    !!key &&
    !url.includes("YOUR-PROJECT") &&
    key !== "your-service-role-key" &&
    key.length > 20
  );
}

// The active source, resolved lazily on first use (server-side). Tests may
// override via setCatalogSource().
let active: CatalogSource | null = null;

export async function getCatalogSource(): Promise<CatalogSource> {
  if (active) return active;
  if (isDbConfigured()) {
    const { createSupabaseCatalogSource } = await import("@/lib/catalog/supabase-source");
    active = withFileFallback(createSupabaseCatalogSource(), fileCatalogSource);
  } else {
    active = fileCatalogSource;
  }
  return active;
}

/** Override the active source (tests). Pass null to force re-resolution. */
export function setCatalogSource(source: CatalogSource | null): void {
  active = source;
}

// ---------------------------------------------------------------------------
// Public async read API — the single path the app uses.
// ---------------------------------------------------------------------------

export async function getGames(): Promise<Game[]> {
  return (await getCatalogSource()).getGames();
}
export async function getGame(slug: GameSlug): Promise<Game> {
  return (await getCatalogSource()).getGame(slug);
}
export async function getRanks(slug: GameSlug): Promise<Rank[]> {
  return (await getCatalogSource()).getRanks(slug);
}
export async function getPlacementPrices(slug: GameSlug): Promise<PlacementPrice[]> {
  return (await getCatalogSource()).getPlacementPrices(slug);
}
export async function getNetWinGroups(slug: GameSlug): Promise<NetWinGroup[]> {
  return (await getCatalogSource()).getNetWinGroups(slug);
}
export async function getRegions(slug: GameSlug): Promise<Region[]> {
  return (await getCatalogSource()).getRegions(slug);
}
export async function getModifiers(): Promise<Modifier[]> {
  return (await getCatalogSource()).getModifiers();
}
export async function getCoupon(code: string | undefined): Promise<CouponRecord | null> {
  return (await getCatalogSource()).getCoupon(code);
}
export async function getPricingSettings(): Promise<PricingSettings> {
  return (await getCatalogSource()).getPricingSettings();
}
export async function getPricingContext(
  gameSlug: GameSlug,
  serviceType: ServiceType,
  options?: BuildContextOptions,
): Promise<PricingContext> {
  return (await getCatalogSource()).getPricingContext(gameSlug, serviceType, options);
}

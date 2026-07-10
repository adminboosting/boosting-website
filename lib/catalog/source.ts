/**
 * Single catalog data-access layer (spec A5).
 *
 * This is the ONLY module the calculator and marketing pages may read catalog
 * data through: games, ranks, prices, modifiers, regions, coupons, and pricing
 * settings. Nothing else in the app imports `lib/catalog/data.ts` directly — the
 * rest of the app must not know where the catalog comes from.
 *
 * Phase A (now): file-backed. Every getter delegates to the in-code catalog in
 *   `./data`, so the site runs with zero backend.
 * Phase B: a Supabase-backed `CatalogSource` is swapped in via
 *   `setCatalogSource()`. It reads the database and falls back to the file source
 *   when no Supabase project is configured (local dev). Because every consumer
 *   depends only on this module's surface, that swap will not touch the pages or
 *   the pricing route.
 *
 * ⚠️ Phase B will make these getters ASYNC (supabase-js is async). Consumers are
 * server components / route handlers and will `await` them at that point. The
 * price-parity regression test (Gate B) guards that the DB source returns values
 * byte-identical to this file source, so the cutover cannot silently change any
 * price. Do not add a second read path around this module to avoid the await.
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

/**
 * The contract every catalog backend implements. Phase A ships the file-backed
 * implementation below; Phase B adds a Supabase-backed one with this same file
 * source as its fallback.
 */
export interface CatalogSource {
  /** Which backend answered — surfaced for diagnostics and tests. */
  readonly kind: "file" | "database";
  getGames(): Game[];
  getGame(slug: GameSlug): Game;
  getRanks(slug: GameSlug): Rank[];
  getPlacementPrices(slug: GameSlug): PlacementPrice[];
  getNetWinGroups(slug: GameSlug): NetWinGroup[];
  getRegions(slug: GameSlug): Region[];
  getModifiers(): Modifier[];
  getCoupon(code: string | undefined): CouponRecord | null;
  getPricingSettings(): PricingSettings;
  /**
   * Assemble the full context the pure pricing engine consumes for one
   * game+service. The engine never learns which source built it.
   */
  getPricingContext(
    gameSlug: GameSlug,
    serviceType: ServiceType,
    options?: BuildContextOptions,
  ): PricingContext;
}

/** File-backed catalog source — delegates to the in-code catalog (`./data`). */
export const fileCatalogSource: CatalogSource = {
  kind: "file",
  getGames: () => GAMES,
  getGame: (slug) => fileGetGame(slug),
  getRanks: (slug) => fileGetRanks(slug),
  getPlacementPrices: (slug) => fileGetPlacementPrices(slug),
  getNetWinGroups: (slug) => fileGetNetWinGroups(slug),
  getRegions: (slug) => fileGetRegions(slug),
  getModifiers: () => fileGetModifiers(),
  getCoupon: (code) => fileGetCoupon(code),
  getPricingSettings: () => DEFAULT_PRICING_SETTINGS,
  getPricingContext: (gameSlug, serviceType, options) =>
    buildPricingContext(gameSlug, serviceType, options),
};

// The active source. Phase B calls setCatalogSource() from server bootstrap to
// install the DB-backed source when Supabase is configured.
let active: CatalogSource = fileCatalogSource;

export function getCatalogSource(): CatalogSource {
  return active;
}

export function setCatalogSource(source: CatalogSource): void {
  active = source;
}

// ---------------------------------------------------------------------------
// Public read API — the single path the app uses. Every function routes through
// the active source so the cutover in Phase B is a one-line swap.
// ---------------------------------------------------------------------------

export const getGames = (): Game[] => getCatalogSource().getGames();
export const getGame = (slug: GameSlug): Game => getCatalogSource().getGame(slug);
export const getRanks = (slug: GameSlug): Rank[] => getCatalogSource().getRanks(slug);
export const getPlacementPrices = (slug: GameSlug): PlacementPrice[] =>
  getCatalogSource().getPlacementPrices(slug);
export const getNetWinGroups = (slug: GameSlug): NetWinGroup[] =>
  getCatalogSource().getNetWinGroups(slug);
export const getRegions = (slug: GameSlug): Region[] => getCatalogSource().getRegions(slug);
export const getModifiers = (): Modifier[] => getCatalogSource().getModifiers();
export const getCoupon = (code: string | undefined): CouponRecord | null =>
  getCatalogSource().getCoupon(code);
export const getPricingSettings = (): PricingSettings => getCatalogSource().getPricingSettings();
export const getPricingContext = (
  gameSlug: GameSlug,
  serviceType: ServiceType,
  options?: BuildContextOptions,
): PricingContext => getCatalogSource().getPricingContext(gameSlug, serviceType, options);

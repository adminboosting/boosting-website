/**
 * Database-backed catalog sources (spec B3). Two builders share ONE set of
 * row→type mappers and ONE context-assembly path, so both produce values
 * byte-identical to the file source:
 *
 *   - createSqlCatalogSource(reader): reads via raw SQL. Used by the price-parity
 *     and integration tests against PGlite. Also the shape a direct-Postgres
 *     runtime could use.
 *   - createSupabaseCatalogSource(): reads via supabase-js (PostgREST) with the
 *     server-only service-role client. This is the runtime path once a Supabase
 *     project is configured.
 *
 * The price-parity regression test drives the SQL variant against the real schema
 * + generated seed and asserts computeQuote() matches the file source exactly, so
 * the schema, seed, mappers, and assembly can't silently change any price.
 *
 * This module is deliberately free of `server-only` / supabase-js / the admin
 * client so the parity test can import it in plain Node. The runtime supabase-js
 * backend lives in the server-only companion `supabase-source.ts`, which reuses
 * the `assemble` + mappers exported here.
 */
import { DEFAULT_PRICING_SETTINGS } from "@/lib/catalog/data";
import type {
  CouponRecord,
  Game,
  GameSlug,
  Modifier,
  NetWinGroup,
  PlacementBand,
  PlacementPrice,
  PricingSettings,
  Rank,
  Region,
  ServiceType,
} from "@/lib/catalog/types";
import type { BuildContextOptions, CatalogSource } from "@/lib/catalog/source";

export type Row = Record<string, unknown>;

// Service display names — identical to the file source's mapping; also read from
// the DB `services` table, with this as the fallback if a row is missing.
export const SERVICE_NAMES: Record<ServiceType, string> = {
  rank_boost: "Rank / Division Boost",
  placements: "Placement Matches",
  net_wins: "Ranked Net Wins",
};

// --- numeric/date coercion (drivers may hand back strings) ------------------
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));
const bool = (v: unknown): boolean => v === true || v === "t" || v === "true";
const isoOrNull = (v: unknown): string | null =>
  v == null ? null : new Date(v as string).toISOString();

// --- row -> domain-type mappers (shared by both builders) -------------------
export const rowToGame = (r: Row): Game => ({
  slug: r.slug as GameSlug,
  name: r.name as string,
  shortName: r.short_name as string,
  divisionsPerTier: num(r.divisions_per_tier),
});
export const rowToRank = (r: Row): Rank => ({
  gameSlug: r.game_slug as GameSlug,
  tier: r.tier as string,
  division: num(r.division),
  label: r.label as string,
  sortIndex: num(r.sort_index),
  climbPriceCents: num(r.climb_price_cents),
  climbEtaHours: num(r.climb_eta_hours),
  isPurchasable: bool(r.is_purchasable),
});
export const rowToPlacement = (r: Row): PlacementPrice => ({
  gameSlug: r.game_slug as GameSlug,
  band: r.band as PlacementBand,
  label: r.label as string,
  pricePerGameCents: num(r.price_per_game_cents),
  minGames: num(r.min_games),
  maxGames: num(r.max_games),
  etaPerGameHours: num(r.eta_per_game_hours),
});
export const rowToNetWin = (r: Row): NetWinGroup => ({
  gameSlug: r.game_slug as GameSlug,
  group: r.group_key as NetWinGroup["group"],
  label: r.label as string,
  pricePerWinCents: num(r.price_per_win_cents),
  tiers: r.tiers as string[],
  etaPerWinHours: num(r.eta_per_win_hours),
});
export const rowToModifier = (r: Row): Modifier => ({
  key: r.key as string,
  label: r.label as string,
  description: r.description as string,
  kind: r.kind as Modifier["kind"],
  amount: num(r.amount),
  etaMultiplier: num(r.eta_multiplier),
  isDefaultOn: bool(r.is_default_on),
  isActive: bool(r.is_active),
  sortOrder: num(r.sort_order),
  gameSlug: (r.game_slug as GameSlug | null) ?? null,
  serviceType: (r.service_type as ServiceType | null) ?? null,
  hiddenInDuo: bool(r.hidden_in_duo),
});
export const rowToRegion = (r: Row): Region => ({
  gameSlug: r.game_slug as GameSlug,
  code: r.code as string,
  label: r.label as string,
  multiplier: num(r.multiplier),
  isDefault: bool(r.is_default),
  sortOrder: num(r.sort_order),
});
export const rowToCoupon = (r: Row): CouponRecord => ({
  code: r.code as string,
  kind: r.kind as CouponRecord["kind"],
  amount: num(r.amount),
  minOrderCents: num(r.min_order_cents),
  maxUses: r.max_uses == null ? null : num(r.max_uses),
  uses: num(r.uses),
  expiresAt: isoOrNull(r.expires_at),
  isActive: bool(r.is_active),
});

// --- reader abstraction: the two backends only differ in how they fetch rows -
export interface CatalogReaders {
  games(): Promise<Game[]>;
  ranks(slug: GameSlug): Promise<Rank[]>;
  placementPrices(slug: GameSlug): Promise<PlacementPrice[]>;
  netWinGroups(slug: GameSlug): Promise<NetWinGroup[]>;
  regions(slug: GameSlug): Promise<Region[]>;
  modifiers(): Promise<Modifier[]>;
  coupon(code: string | undefined): Promise<CouponRecord | null>;
  pricingSettings(): Promise<PricingSettings>;
  serviceName(type: ServiceType): Promise<string>;
}

export function assemble(kind: "database", readers: CatalogReaders): CatalogSource {
  const source: CatalogSource = {
    kind,
    getGames: () => readers.games(),
    async getGame(slug) {
      const game = (await readers.games()).find((g) => g.slug === slug);
      if (!game) throw new Error(`Unknown game: ${slug}`);
      return game;
    },
    getRanks: (slug) => readers.ranks(slug),
    getPlacementPrices: (slug) => readers.placementPrices(slug),
    getNetWinGroups: (slug) => readers.netWinGroups(slug),
    getRegions: (slug) => readers.regions(slug),
    getModifiers: () => readers.modifiers(),
    getCoupon: (code) => readers.coupon(code),
    getPricingSettings: () => readers.pricingSettings(),
    async getPricingContext(gameSlug, serviceType, options: BuildContextOptions = {}) {
      const [
        game,
        ranks,
        regions,
        modifiers,
        placementPrices,
        netWinGroups,
        settings,
        serviceName,
        coupon,
      ] = await Promise.all([
        source.getGame(gameSlug),
        readers.ranks(gameSlug),
        readers.regions(gameSlug),
        readers.modifiers(),
        readers.placementPrices(gameSlug),
        readers.netWinGroups(gameSlug),
        options.settings ? Promise.resolve(options.settings) : readers.pricingSettings(),
        readers.serviceName(serviceType),
        readers.coupon(options.couponCode),
      ]);
      return {
        game,
        service: { type: serviceType, name: serviceName },
        ranks,
        regions,
        modifiers,
        placementPrices,
        netWinGroups,
        settings,
        coupon,
        account: options.account ?? null,
        nowMs: options.nowMs,
      };
    },
  };
  return source;
}

// --- SQL-reader backend (tests / direct Postgres) ---------------------------
export interface SqlReader {
  query<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

function sqlReaders(reader: SqlReader): CatalogReaders {
  const all = async <T>(sql: string, params: unknown[], map: (r: Row) => T): Promise<T[]> => {
    const { rows } = await reader.query<Row>(sql, params);
    return rows.map(map);
  };
  return {
    games: () => all("select * from public.games order by sort_order", [], rowToGame),
    ranks: (slug) =>
      all("select * from public.ranks where game_slug = $1 order by sort_index", [slug], rowToRank),
    placementPrices: (slug) =>
      all(
        "select * from public.placement_prices where game_slug = $1 order by price_per_game_cents",
        [slug],
        rowToPlacement,
      ),
    netWinGroups: (slug) =>
      all(
        "select * from public.net_win_groups where game_slug = $1 order by price_per_win_cents",
        [slug],
        rowToNetWin,
      ),
    regions: (slug) =>
      all(
        "select * from public.regions where game_slug = $1 order by sort_order",
        [slug],
        rowToRegion,
      ),
    modifiers: () => all("select * from public.modifiers order by sort_order", [], rowToModifier),
    async coupon(code) {
      if (!code) return null;
      const { rows } = await reader.query<Row>("select * from public.coupons where code = $1", [
        code.trim().toUpperCase(),
      ]);
      return rows[0] ? rowToCoupon(rows[0]) : null;
    },
    async pricingSettings() {
      const { rows } = await reader.query<Row>(
        "select value from public.site_settings where key = 'pricing_settings'",
        [],
      );
      return (rows[0]?.value as PricingSettings) ?? DEFAULT_PRICING_SETTINGS;
    },
    async serviceName(type) {
      const { rows } = await reader.query<Row>("select name from public.services where type = $1", [
        type,
      ]);
      return (rows[0]?.name as string) ?? SERVICE_NAMES[type];
    },
  };
}

export function createSqlCatalogSource(reader: SqlReader): CatalogSource {
  return assemble("database", sqlReaders(reader));
}

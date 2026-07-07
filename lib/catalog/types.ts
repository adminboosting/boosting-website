/**
 * Catalog domain types. These mirror the database tables (spec §6) but are the
 * shape the pricing engine consumes. The static catalog in `data.ts` and the
 * DB-backed loader both produce these types, so the engine never cares which
 * source it came from.
 */

export type GameSlug = "league-of-legends" | "valorant" | "overwatch-2" | "marvel-rivals";

export type ServiceType = "rank_boost" | "placements" | "net_wins";

export type OrderMode = "piloted" | "duo";

export type ModifierKind = "percent" | "flat";

export type CouponKind = "percent" | "flat";

export type PlacementBand = "unranked_low" | "mid" | "high";

export type NetWinGroupKey = "low" | "mid" | "high" | "elite";

export interface Game {
  slug: GameSlug;
  name: string;
  shortName: string;
  divisionsPerTier: number;
}

export interface Rank {
  gameSlug: GameSlug;
  tier: string;
  /** 0 = divisionless (e.g. Master+). Otherwise the division number (Gold IV -> 4). */
  division: number;
  label: string;
  /** 0 = lowest; strictly increasing up the ladder. */
  sortIndex: number;
  /** Cost of the single step into this rank from the previous sort_index. */
  climbPriceCents: number;
  climbEtaHours: number;
  /** false for above-ceiling ranks shown only as "contact us". */
  isPurchasable: boolean;
}

export interface PlacementPrice {
  gameSlug: GameSlug;
  band: PlacementBand;
  label: string;
  pricePerGameCents: number;
  minGames: number;
  maxGames: number;
  etaPerGameHours: number;
}

export interface NetWinGroup {
  gameSlug: GameSlug;
  group: NetWinGroupKey;
  label: string;
  pricePerWinCents: number;
  /** Tier names (matching Rank.tier) that fall into this group. */
  tiers: string[];
  etaPerWinHours: number;
}

export interface Modifier {
  key: string;
  label: string;
  description: string;
  kind: ModifierKind;
  /** percent -> basis points (2000 = +20%); flat -> cents. */
  amount: number;
  etaMultiplier: number;
  isDefaultOn: boolean;
  isActive: boolean;
  sortOrder: number;
  /** null = applies to all games. */
  gameSlug: GameSlug | null;
  /** null = applies to all services. */
  serviceType: ServiceType | null;
  /** Piloted-only options are hidden/invalid in duo mode. */
  hiddenInDuo: boolean;
}

export interface Region {
  gameSlug: GameSlug;
  code: string;
  label: string;
  multiplier: number;
  isDefault: boolean;
  sortOrder: number;
}

export interface CouponRecord {
  code: string;
  kind: CouponKind;
  /** percent -> basis points; flat -> cents. */
  amount: number;
  minOrderCents: number;
  maxUses: number | null;
  uses: number;
  /** ISO timestamp or null for no expiry. */
  expiresAt: string | null;
  isActive: boolean;
}

export interface LoyaltyTier {
  name: string;
  minLifetimeSpendCents: number;
  discountBp: number;
  cashbackBp: number;
  sortOrder: number;
}

export interface VolumeDiscountBand {
  minCents: number;
  bp: number;
}

export interface LolLpRules {
  /** current LP band -> multiplier applied to the first climb step. */
  proration: Record<number, number>;
  /** surcharge (bp) applied to the whole rank-boost base when gain is "low". */
  lowGainSurchargeBp: number;
  /** multiplier applied when the LoL Flex queue is selected. */
  flexMultiplier: number;
}

export interface PricingSettings {
  duoMultiplierBp: number;
  boosterCutBp: number;
  volumeDiscounts: VolumeDiscountBand[];
  maxTotalDiscountBp: number;
  lolLpRules: LolLpRules;
}

/** Loyalty + wallet context for the (optional) signed-in customer. */
export interface AccountPricingContext {
  loyaltyDiscountBp: number;
  loyaltyCashbackBp: number;
  storeCreditCents: number;
}

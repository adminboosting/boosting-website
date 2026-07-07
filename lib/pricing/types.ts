import type {
  AccountPricingContext,
  CouponRecord,
  Game,
  GameSlug,
  Modifier,
  NetWinGroup,
  OrderMode,
  PlacementBand,
  PlacementPrice,
  PricingSettings,
  Rank,
  Region,
  ServiceType,
} from "@/lib/catalog/types";

/**
 * Per-service configuration. Keys are camelCase throughout (client payload,
 * engine, and the `orders.config` jsonb) to avoid snake/camel mapping — see
 * DECISIONS.md.
 */
export interface RankBoostConfig {
  currentRankIndex: number;
  desiredRankIndex: number;
  /** LoL only: current LP into the division. */
  currentLpBand?: 0 | 25 | 50 | 75;
  /** LoL only: "low" adds a surcharge for low-LP-gain accounts. */
  lpGainBand?: "normal" | "low";
  /** LoL/Valorant rank-boost: "flex" applies the Flex multiplier (LoL). */
  queue?: "solo" | "flex";
}

export interface PlacementsConfig {
  gamesCount: number;
  previousBand: PlacementBand;
}

export interface NetWinsConfig {
  winsCount: number;
  currentRankIndex: number;
}

export type QuoteConfig = RankBoostConfig | PlacementsConfig | NetWinsConfig;

export interface QuoteInput {
  gameSlug: GameSlug;
  serviceType: ServiceType;
  mode: OrderMode;
  regionCode: string;
  config: QuoteConfig;
  modifierKeys: string[];
  couponCode?: string;
  /** Only meaningful when an account context is attached. */
  applyStoreCredit?: boolean;
}

export type QuoteLineKind = "base" | "modifier" | "discount" | "credit";

export interface QuoteLine {
  key: string;
  label: string;
  amountCents: number;
  kind: QuoteLineKind;
}

export interface Quote {
  baseCents: number;
  modifiersCents: number;
  discountCents: number;
  storeCreditAppliedCents: number;
  totalCents: number;
  etaHours: number;
  lines: QuoteLine[];
  cashbackPreviewCents: number;
  currency: "USD";
  warnings: string[];
}

/**
 * Everything the pure engine needs, resolved for one game+service. Assembled by
 * the static catalog (`buildPricingContext`) or the DB loader.
 */
export interface PricingContext {
  game: Game;
  service: { type: ServiceType; name: string };
  ranks: Rank[]; // this game, sorted ascending by sortIndex
  regions: Region[];
  modifiers: Modifier[];
  placementPrices: PlacementPrice[];
  netWinGroups: NetWinGroup[];
  settings: PricingSettings;
  coupon?: CouponRecord | null;
  account?: AccountPricingContext | null;
  /** Injectable clock for deterministic coupon-expiry tests. Defaults to now. */
  nowMs?: number;
}

/** Thrown for hard rejections (bad range, non-purchasable rank, out-of-bounds). */
export class PricingError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PricingError";
    this.code = code;
  }
}

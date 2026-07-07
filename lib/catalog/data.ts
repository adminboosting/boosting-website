/**
 * Static catalog — the single source of truth for placeholder pricing (spec §7).
 *
 * This powers the pricing engine directly and lets the calculator work on the
 * free tier with ZERO backend setup. Once Supabase is wired, the DB becomes the
 * source of truth (admin-editable) and overrides these values; `supabase/seed.sql`
 * is generated from this same data so the two never drift.
 *
 * All prices are integer cents. Marked PLACEHOLDER — review before launch.
 */
import type {
  AccountPricingContext,
  CouponRecord,
  Game,
  GameSlug,
  LoyaltyTier,
  Modifier,
  NetWinGroup,
  NetWinGroupKey,
  PlacementPrice,
  PricingSettings,
  Rank,
  Region,
  ServiceType,
} from "@/lib/catalog/types";
import type { PricingContext } from "@/lib/pricing/types";

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

export const GAMES: Game[] = [
  { slug: "league-of-legends", name: "League of Legends", shortName: "LoL", divisionsPerTier: 4 },
  { slug: "valorant", name: "Valorant", shortName: "VAL", divisionsPerTier: 3 },
  { slug: "overwatch-2", name: "Overwatch 2", shortName: "OW2", divisionsPerTier: 5 },
  { slug: "marvel-rivals", name: "Marvel Rivals", shortName: "MR", divisionsPerTier: 3 },
];

export function getGame(slug: GameSlug): Game {
  const game = GAMES.find((g) => g.slug === slug);
  if (!game) throw new Error(`Unknown game: ${slug}`);
  return game;
}

// ---------------------------------------------------------------------------
// Rank ladders
// ---------------------------------------------------------------------------

interface TierDef {
  tier: string;
  priceCents: number;
  etaHours: number;
  /** Division labels low->high within the tier, or null for a divisionless tier. */
  divisions: string[] | null;
  purchasable: boolean;
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };

function divisionNumber(label: string): number {
  return ROMAN[label] ?? Number.parseInt(label, 10) ?? 0;
}

function buildRanks(gameSlug: GameSlug, defs: TierDef[]): Rank[] {
  const ranks: Rank[] = [];
  let sortIndex = 0;
  for (const def of defs) {
    if (def.divisions === null) {
      ranks.push({
        gameSlug,
        tier: def.tier,
        division: 0,
        label: def.tier,
        sortIndex: sortIndex++,
        climbPriceCents: def.purchasable ? def.priceCents : 0,
        climbEtaHours: def.purchasable ? def.etaHours : 0,
        isPurchasable: def.purchasable,
      });
    } else {
      for (const div of def.divisions) {
        ranks.push({
          gameSlug,
          tier: def.tier,
          division: divisionNumber(div),
          label: `${def.tier} ${div}`,
          sortIndex: sortIndex++,
          climbPriceCents: def.priceCents,
          climbEtaHours: def.etaHours,
          isPurchasable: def.purchasable,
        });
      }
    }
  }
  return ranks;
}

const LOL_DIVS = ["IV", "III", "II", "I"];
const VAL_DIVS = ["1", "2", "3"];
const OW2_DIVS = ["5", "4", "3", "2", "1"];
const MR_DIVS = ["III", "II", "I"];

const RANKS: Record<GameSlug, Rank[]> = {
  "league-of-legends": buildRanks("league-of-legends", [
    { tier: "Iron", priceCents: 600, etaHours: 2.0, divisions: LOL_DIVS, purchasable: true },
    { tier: "Bronze", priceCents: 900, etaHours: 2.5, divisions: LOL_DIVS, purchasable: true },
    { tier: "Silver", priceCents: 1200, etaHours: 3.0, divisions: LOL_DIVS, purchasable: true },
    { tier: "Gold", priceCents: 1800, etaHours: 3.5, divisions: LOL_DIVS, purchasable: true },
    { tier: "Platinum", priceCents: 2600, etaHours: 4.5, divisions: LOL_DIVS, purchasable: true },
    { tier: "Emerald", priceCents: 3800, etaHours: 5.5, divisions: LOL_DIVS, purchasable: true },
    { tier: "Diamond", priceCents: 5200, etaHours: 7.0, divisions: LOL_DIVS, purchasable: true },
    { tier: "Master", priceCents: 0, etaHours: 0, divisions: null, purchasable: false },
    { tier: "Grandmaster", priceCents: 0, etaHours: 0, divisions: null, purchasable: false },
    { tier: "Challenger", priceCents: 0, etaHours: 0, divisions: null, purchasable: false },
  ]),
  valorant: buildRanks("valorant", [
    { tier: "Iron", priceCents: 800, etaHours: 2.0, divisions: VAL_DIVS, purchasable: true },
    { tier: "Bronze", priceCents: 1000, etaHours: 2.5, divisions: VAL_DIVS, purchasable: true },
    { tier: "Silver", priceCents: 1300, etaHours: 3.0, divisions: VAL_DIVS, purchasable: true },
    { tier: "Gold", priceCents: 1600, etaHours: 3.5, divisions: VAL_DIVS, purchasable: true },
    { tier: "Platinum", priceCents: 2100, etaHours: 4.5, divisions: VAL_DIVS, purchasable: true },
    { tier: "Diamond", priceCents: 2700, etaHours: 5.5, divisions: VAL_DIVS, purchasable: true },
    { tier: "Ascendant", priceCents: 4000, etaHours: 7.0, divisions: VAL_DIVS, purchasable: true },
    { tier: "Immortal", priceCents: 0, etaHours: 0, divisions: null, purchasable: false },
    { tier: "Radiant", priceCents: 0, etaHours: 0, divisions: null, purchasable: false },
  ]),
  "overwatch-2": buildRanks("overwatch-2", [
    { tier: "Bronze", priceCents: 900, etaHours: 2.0, divisions: OW2_DIVS, purchasable: true },
    { tier: "Silver", priceCents: 1100, etaHours: 2.5, divisions: OW2_DIVS, purchasable: true },
    { tier: "Gold", priceCents: 1400, etaHours: 3.0, divisions: OW2_DIVS, purchasable: true },
    { tier: "Platinum", priceCents: 1700, etaHours: 3.5, divisions: OW2_DIVS, purchasable: true },
    { tier: "Diamond", priceCents: 2200, etaHours: 4.5, divisions: OW2_DIVS, purchasable: true },
    { tier: "Master", priceCents: 3400, etaHours: 6.0, divisions: OW2_DIVS, purchasable: true },
    { tier: "Grandmaster", priceCents: 5500, etaHours: 8.0, divisions: OW2_DIVS, purchasable: true },
    { tier: "Champion", priceCents: 0, etaHours: 0, divisions: null, purchasable: false },
  ]),
  "marvel-rivals": buildRanks("marvel-rivals", [
    { tier: "Bronze", priceCents: 800, etaHours: 1.5, divisions: MR_DIVS, purchasable: true },
    { tier: "Silver", priceCents: 1000, etaHours: 2.0, divisions: MR_DIVS, purchasable: true },
    { tier: "Gold", priceCents: 1200, etaHours: 2.5, divisions: MR_DIVS, purchasable: true },
    { tier: "Platinum", priceCents: 1600, etaHours: 3.0, divisions: MR_DIVS, purchasable: true },
    { tier: "Diamond", priceCents: 2200, etaHours: 4.0, divisions: MR_DIVS, purchasable: true },
    { tier: "Grandmaster", priceCents: 4000, etaHours: 6.0, divisions: MR_DIVS, purchasable: true },
    { tier: "Celestial", priceCents: 6000, etaHours: 8.0, divisions: MR_DIVS, purchasable: true },
    { tier: "Eternity", priceCents: 0, etaHours: 0, divisions: null, purchasable: false },
    { tier: "One Above All", priceCents: 0, etaHours: 0, divisions: null, purchasable: false },
  ]),
};

export function getRanks(slug: GameSlug): Rank[] {
  return RANKS[slug];
}

// ---------------------------------------------------------------------------
// Placement prices
// ---------------------------------------------------------------------------

const PLACEMENT_LABELS = {
  unranked_low: "Unranked / Bronze–Silver",
  mid: "Gold–Platinum",
  high: "Diamond+",
} as const;

function placementSet(
  gameSlug: GameSlug,
  low: number,
  mid: number,
  high: number,
  maxGames: number,
): PlacementPrice[] {
  const base = { gameSlug, minGames: 1, maxGames, etaPerGameHours: 0.8 };
  return [
    { ...base, band: "unranked_low", label: PLACEMENT_LABELS.unranked_low, pricePerGameCents: low },
    { ...base, band: "mid", label: PLACEMENT_LABELS.mid, pricePerGameCents: mid },
    { ...base, band: "high", label: PLACEMENT_LABELS.high, pricePerGameCents: high },
  ];
}

const PLACEMENT_PRICES: Record<GameSlug, PlacementPrice[]> = {
  "league-of-legends": placementSet("league-of-legends", 600, 780, 1020, 5),
  valorant: placementSet("valorant", 600, 780, 1020, 5),
  "overwatch-2": placementSet("overwatch-2", 700, 910, 1190, 10),
  "marvel-rivals": placementSet("marvel-rivals", 600, 780, 1020, 10),
};

export function getPlacementPrices(slug: GameSlug): PlacementPrice[] {
  return PLACEMENT_PRICES[slug];
}

// ---------------------------------------------------------------------------
// Net-win groups (keyed to current tier)
// ---------------------------------------------------------------------------

const NETWIN_LABELS: Record<NetWinGroupKey, string> = {
  low: "Low tiers",
  mid: "Mid tiers",
  high: "High tiers",
  elite: "Elite tiers",
};

interface NetWinEntry {
  group: NetWinGroupKey;
  tiers: string[];
  pricePerWinCents: number;
}

function netWinSet(gameSlug: GameSlug, entries: NetWinEntry[]): NetWinGroup[] {
  return entries.map((e) => ({
    gameSlug,
    group: e.group,
    label: NETWIN_LABELS[e.group],
    pricePerWinCents: e.pricePerWinCents,
    tiers: e.tiers,
    etaPerWinHours: 0.7,
  }));
}

const NET_WIN_GROUPS: Record<GameSlug, NetWinGroup[]> = {
  "league-of-legends": netWinSet("league-of-legends", [
    { group: "low", tiers: ["Iron", "Bronze", "Silver"], pricePerWinCents: 400 },
    { group: "mid", tiers: ["Gold", "Platinum"], pricePerWinCents: 800 },
    { group: "high", tiers: ["Emerald", "Diamond"], pricePerWinCents: 1500 },
    { group: "elite", tiers: ["Master", "Grandmaster", "Challenger"], pricePerWinCents: 2800 },
  ]),
  valorant: netWinSet("valorant", [
    { group: "low", tiers: ["Iron", "Bronze", "Silver"], pricePerWinCents: 450 },
    { group: "mid", tiers: ["Gold", "Platinum"], pricePerWinCents: 850 },
    { group: "high", tiers: ["Diamond", "Ascendant"], pricePerWinCents: 1600 },
    { group: "elite", tiers: ["Immortal", "Radiant"], pricePerWinCents: 3000 },
  ]),
  "overwatch-2": netWinSet("overwatch-2", [
    { group: "low", tiers: ["Bronze", "Silver"], pricePerWinCents: 450 },
    { group: "mid", tiers: ["Gold", "Platinum"], pricePerWinCents: 800 },
    { group: "high", tiers: ["Diamond"], pricePerWinCents: 1400 },
    { group: "elite", tiers: ["Master", "Grandmaster"], pricePerWinCents: 2600 },
  ]),
  "marvel-rivals": netWinSet("marvel-rivals", [
    { group: "low", tiers: ["Bronze", "Silver"], pricePerWinCents: 400 },
    { group: "mid", tiers: ["Gold", "Platinum"], pricePerWinCents: 700 },
    { group: "high", tiers: ["Diamond"], pricePerWinCents: 1300 },
    { group: "elite", tiers: ["Grandmaster", "Celestial"], pricePerWinCents: 2600 },
  ]),
};

export function getNetWinGroups(slug: GameSlug): NetWinGroup[] {
  return NET_WIN_GROUPS[slug];
}

// ---------------------------------------------------------------------------
// Modifiers (global)
// ---------------------------------------------------------------------------

export const MODIFIERS: Modifier[] = [
  {
    key: "express",
    label: "Express priority",
    description: "Your order is prioritized and completed faster.",
    kind: "percent",
    amount: 2000,
    etaMultiplier: 0.8,
    isDefaultOn: false,
    isActive: true,
    sortOrder: 10,
    gameSlug: null,
    serviceType: null,
    hiddenInDuo: false,
  },
  {
    key: "stream",
    label: "Private stream of games",
    description: "Watch your games live via a private stream.",
    kind: "percent",
    amount: 1500,
    etaMultiplier: 1.0,
    isDefaultOn: false,
    isActive: true,
    sortOrder: 20,
    gameSlug: null,
    serviceType: null,
    hiddenInDuo: false,
  },
  {
    key: "appear_offline",
    label: "Appear offline",
    description: "The booster stays offline/invisible while playing (piloted).",
    kind: "flat",
    amount: 0,
    etaMultiplier: 1.0,
    isDefaultOn: true,
    isActive: true,
    sortOrder: 30,
    gameSlug: null,
    serviceType: null,
    hiddenInDuo: true,
  },
  {
    key: "pick_characters",
    label: "Choose champions/agents/heroes",
    description: "Specify which characters the booster should play.",
    kind: "percent",
    amount: 1000,
    etaMultiplier: 1.1,
    isDefaultOn: false,
    isActive: true,
    sortOrder: 40,
    gameSlug: null,
    serviceType: null,
    hiddenInDuo: false,
  },
  {
    key: "solo_queue_only",
    label: "Solo queue only",
    description: "The booster only plays solo queue (piloted).",
    kind: "flat",
    amount: 0,
    etaMultiplier: 1.15,
    isDefaultOn: false,
    isActive: true,
    sortOrder: 50,
    gameSlug: null,
    serviceType: null,
    hiddenInDuo: true,
  },
  {
    key: "priority_booster",
    label: "Top-rated booster",
    description: "Your order is handled by one of our top-rated boosters.",
    kind: "percent",
    amount: 2000,
    etaMultiplier: 1.0,
    isDefaultOn: false,
    isActive: true,
    sortOrder: 60,
    gameSlug: null,
    serviceType: null,
    hiddenInDuo: false,
  },
];

export function getModifiers(): Modifier[] {
  return MODIFIERS;
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

const REGIONS: Record<GameSlug, Region[]> = {
  "league-of-legends": [
    { code: "na", label: "North America", multiplier: 1.0, isDefault: true, sortOrder: 10 },
    { code: "euw", label: "EU West", multiplier: 1.0, isDefault: false, sortOrder: 20 },
    { code: "eune", label: "EU Nordic & East", multiplier: 0.95, isDefault: false, sortOrder: 30 },
    { code: "br_latam", label: "Brazil / LATAM", multiplier: 0.85, isDefault: false, sortOrder: 40 },
    { code: "oce", label: "Oceania", multiplier: 1.1, isDefault: false, sortOrder: 50 },
    { code: "kr", label: "Korea", multiplier: 1.4, isDefault: false, sortOrder: 60 },
  ].map((r) => ({ gameSlug: "league-of-legends", ...r })),
  valorant: [
    { code: "na", label: "North America", multiplier: 1.0, isDefault: true, sortOrder: 10 },
    { code: "eu", label: "Europe", multiplier: 1.0, isDefault: false, sortOrder: 20 },
    { code: "latam", label: "LATAM", multiplier: 0.85, isDefault: false, sortOrder: 30 },
    { code: "ap", label: "Asia Pacific", multiplier: 1.05, isDefault: false, sortOrder: 40 },
    { code: "kr", label: "Korea", multiplier: 1.3, isDefault: false, sortOrder: 50 },
  ].map((r) => ({ gameSlug: "valorant", ...r })),
  "overwatch-2": [
    { code: "americas", label: "Americas", multiplier: 1.0, isDefault: true, sortOrder: 10 },
    { code: "europe", label: "Europe", multiplier: 1.0, isDefault: false, sortOrder: 20 },
    { code: "asia", label: "Asia", multiplier: 1.1, isDefault: false, sortOrder: 30 },
  ].map((r) => ({ gameSlug: "overwatch-2", ...r })),
  "marvel-rivals": [
    { code: "americas", label: "Americas", multiplier: 1.0, isDefault: true, sortOrder: 10 },
    { code: "europe", label: "Europe", multiplier: 1.0, isDefault: false, sortOrder: 20 },
    { code: "asia", label: "Asia", multiplier: 1.1, isDefault: false, sortOrder: 30 },
  ].map((r) => ({ gameSlug: "marvel-rivals", ...r })),
};

export function getRegions(slug: GameSlug): Region[] {
  return REGIONS[slug];
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export const COUPONS: CouponRecord[] = [
  {
    code: "WELCOME10",
    kind: "percent",
    amount: 1000,
    minOrderCents: 2000,
    maxUses: null,
    uses: 0,
    expiresAt: null,
    isActive: true,
  },
];

export function getCoupon(code: string | undefined): CouponRecord | null {
  if (!code) return null;
  return COUPONS.find((c) => c.code === code.trim().toUpperCase()) ?? null;
}

// ---------------------------------------------------------------------------
// Loyalty tiers
// ---------------------------------------------------------------------------

export const LOYALTY_TIERS: LoyaltyTier[] = [
  { name: "Bronze", minLifetimeSpendCents: 0, discountBp: 200, cashbackBp: 50, sortOrder: 10 },
  { name: "Silver", minLifetimeSpendCents: 15000, discountBp: 500, cashbackBp: 100, sortOrder: 20 },
  { name: "Gold", minLifetimeSpendCents: 40000, discountBp: 1000, cashbackBp: 150, sortOrder: 30 },
  { name: "Platinum", minLifetimeSpendCents: 75000, discountBp: 1600, cashbackBp: 200, sortOrder: 40 },
  { name: "Diamond", minLifetimeSpendCents: 100000, discountBp: 1800, cashbackBp: 250, sortOrder: 50 },
];

export function getLoyaltyTierForSpend(lifetimeSpendCents: number): LoyaltyTier {
  const eligible = LOYALTY_TIERS.filter((t) => lifetimeSpendCents >= t.minLifetimeSpendCents).sort(
    (a, b) => b.minLifetimeSpendCents - a.minLifetimeSpendCents,
  );
  return eligible[0] ?? LOYALTY_TIERS[0]!;
}

// ---------------------------------------------------------------------------
// Pricing settings
// ---------------------------------------------------------------------------

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  duoMultiplierBp: 9000,
  boosterCutBp: 7000,
  volumeDiscounts: [
    { minCents: 10000, bp: 300 },
    { minCents: 20000, bp: 500 },
  ],
  maxTotalDiscountBp: 3000,
  lolLpRules: {
    proration: { 0: 1.0, 25: 0.8, 50: 0.6, 75: 0.4 },
    lowGainSurchargeBp: 2000,
    flexMultiplier: 0.9,
  },
};

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------

const SERVICE_NAMES: Record<ServiceType, string> = {
  rank_boost: "Rank / Division Boost",
  placements: "Placement Matches",
  net_wins: "Ranked Net Wins",
};

export interface BuildContextOptions {
  couponCode?: string;
  account?: AccountPricingContext | null;
  settings?: PricingSettings;
  nowMs?: number;
}

/** Assemble a PricingContext from the static catalog for one game+service. */
export function buildPricingContext(
  gameSlug: GameSlug,
  serviceType: ServiceType,
  options: BuildContextOptions = {},
): PricingContext {
  return {
    game: getGame(gameSlug),
    service: { type: serviceType, name: SERVICE_NAMES[serviceType] },
    ranks: getRanks(gameSlug),
    regions: getRegions(gameSlug),
    modifiers: getModifiers(),
    placementPrices: getPlacementPrices(gameSlug),
    netWinGroups: getNetWinGroups(gameSlug),
    settings: options.settings ?? DEFAULT_PRICING_SETTINGS,
    coupon: getCoupon(options.couponCode),
    account: options.account ?? null,
    nowMs: options.nowMs,
  };
}

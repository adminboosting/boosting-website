/**
 * Booster availability — a single, site-wide source of truth for "how many
 * boosters are available", per game and in total.
 *
 * Two modes, stored in `site_settings` under `booster_availability`:
 *   - "manual" (default): admin-entered counts per game. This is the
 *     placeholder path — real numbers can be typed in /admin/settings now, and
 *     they show everywhere that reads this helper.
 *   - "live": counts derived from real `booster_profiles` (accepting boosters,
 *     counted per game via their `games[]`). Flip to this once boosters onboard.
 *
 * `total` is always the SUM of the per-game counts (a booster who covers two
 * games counts once per game — matching how the numbers are presented).
 *
 * The pure helpers below carry no server-only imports so the test suite can pin
 * them; `getBoosterAvailability()` dynamically imports the service-role client
 * only when a DB is configured (same pattern as the catalog source).
 */
import { GAMES } from "@/lib/catalog/data";
import type { GameSlug } from "@/lib/catalog/types";

export type BoosterAvailabilityMode = "manual" | "live";

export interface BoosterAvailabilityConfig {
  mode: BoosterAvailabilityMode;
  counts: Partial<Record<GameSlug, number>>;
}

export interface BoosterAvailability {
  /** A count for every game (missing/invalid -> 0). */
  perGame: Record<GameSlug, number>;
  /** Sum of `perGame`. */
  total: number;
  /** Which source produced these numbers. */
  mode: BoosterAvailabilityMode;
}

/** The site_settings key this config lives under. */
export const BOOSTER_AVAILABILITY_KEY = "booster_availability";

const GAME_SLUGS: GameSlug[] = GAMES.map((g) => g.slug);

/**
 * Placeholder counts shown until live tracking is switched on. PLACEHOLDER —
 * admin-editable in /admin/settings; safe, modest numbers for a new service.
 */
export const DEFAULT_BOOSTER_AVAILABILITY_CONFIG: BoosterAvailabilityConfig = {
  mode: "manual",
  counts: {
    "league-of-legends": 6,
    valorant: 4,
    "overwatch-2": 3,
    "marvel-rivals": 3,
  },
};

/** Normalize a partial counts map into a non-negative integer for every game. */
export function fillPerGame(counts: Partial<Record<GameSlug, number>>): Record<GameSlug, number> {
  const out = {} as Record<GameSlug, number>;
  for (const slug of GAME_SLUGS) {
    const n = counts[slug];
    out[slug] = typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return out;
}

/** Sum of the per-game counts. */
export function sumPerGame(perGame: Record<GameSlug, number>): number {
  return GAME_SLUGS.reduce((acc, slug) => acc + (perGame[slug] ?? 0), 0);
}

/** Defensively coerce an unknown site_settings value into a valid config. */
export function parseConfig(value: unknown): BoosterAvailabilityConfig {
  if (!value || typeof value !== "object") return DEFAULT_BOOSTER_AVAILABILITY_CONFIG;
  const v = value as Record<string, unknown>;
  const mode: BoosterAvailabilityMode = v.mode === "live" ? "live" : "manual";
  const raw = (v.counts && typeof v.counts === "object" ? v.counts : {}) as Record<string, unknown>;
  const counts: Partial<Record<GameSlug, number>> = {};
  for (const slug of GAME_SLUGS) {
    const n = raw[slug];
    if (typeof n === "number" && Number.isFinite(n)) counts[slug] = Math.max(0, Math.floor(n));
  }
  return { mode, counts };
}

function summarize(
  perGame: Record<GameSlug, number>,
  mode: BoosterAvailabilityMode,
): BoosterAvailability {
  return { perGame, total: sumPerGame(perGame), mode };
}

/** Tally accepting boosters per game from raw booster_profiles rows (pure). */
export function tallyLiveCounts(
  rows: Array<{ games: string[] | null; is_accepting?: boolean | null }>,
): Record<GameSlug, number> {
  const counts: Partial<Record<GameSlug, number>> = {};
  for (const row of rows) {
    if (row.is_accepting === false) continue;
    for (const g of row.games ?? []) {
      if ((GAME_SLUGS as string[]).includes(g)) {
        counts[g as GameSlug] = (counts[g as GameSlug] ?? 0) + 1;
      }
    }
  }
  return fillPerGame(counts);
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

/**
 * The one call the whole site uses. Reads the admin config from site_settings;
 * in "live" mode derives counts from booster_profiles. Falls back to the
 * placeholder defaults with no DB, on any error, or on an empty config.
 */
export async function getBoosterAvailability(): Promise<BoosterAvailability> {
  const fallback = summarize(fillPerGame(DEFAULT_BOOSTER_AVAILABILITY_CONFIG.counts), "manual");
  if (!isDbConfigured()) return fallback;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const db = createAdminClient();
    const { data } = await db
      .from("site_settings")
      .select("value")
      .eq("key", BOOSTER_AVAILABILITY_KEY)
      .limit(1)
      .maybeSingle();
    const config = data?.value ? parseConfig(data.value) : DEFAULT_BOOSTER_AVAILABILITY_CONFIG;
    if (config.mode === "live") {
      const { data: rows } = await db.from("booster_profiles").select("games, is_accepting");
      return summarize(tallyLiveCounts(rows ?? []), "live");
    }
    return summarize(fillPerGame(config.counts), "manual");
  } catch {
    return fallback;
  }
}

/** Live counts only (for the admin editor's "what live would show" preview). */
export async function getLiveBoosterCounts(): Promise<Record<GameSlug, number> | null> {
  if (!isDbConfigured()) return null;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const db = createAdminClient();
    const { data } = await db.from("booster_profiles").select("games, is_accepting");
    return tallyLiveCounts(data ?? []);
  } catch {
    return null;
  }
}

/**
 * Compile-time brand + platform constants.
 *
 * BRAND_NAME is the single source of truth for the working name. To rename the
 * platform you change (1) this constant, (2) the `brand_name` row in
 * `site_settings` (which overrides this value for runtime display once the DB is
 * wired), and (3) the logo asset in /public. Nothing else references the name.
 */
export const BRAND_NAME = "RankForge";

export const BRAND_TAGLINE = "Climb faster with vetted pros.";

/** USD, integer cents everywhere. Display formatting happens only at the UI edge. */
export const DEFAULT_CURRENCY = "USD" as const;

/** Fallback support email until an admin sets `support_email` in site_settings. */
export const SUPPORT_EMAIL_FALLBACK = "support@example.com";

/** Launch games (slugs match the `games.slug` column). */
export const LAUNCH_GAME_SLUGS = [
  "league-of-legends",
  "valorant",
  "overwatch-2",
  "marvel-rivals",
] as const;

export type LaunchGameSlug = (typeof LAUNCH_GAME_SLUGS)[number];

/** Canonical origin, always without a trailing slash. */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

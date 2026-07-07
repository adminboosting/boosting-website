import { z } from "zod";

/**
 * Zod schema for the /api/quote request body. The client sends only selections;
 * the server computes the price. Every external input is validated here.
 */

export const gameSlugSchema = z.enum([
  "league-of-legends",
  "valorant",
  "overwatch-2",
  "marvel-rivals",
]);

export const serviceTypeSchema = z.enum(["rank_boost", "placements", "net_wins"]);

export const modeSchema = z.enum(["piloted", "duo"]);

const rankBoostConfigSchema = z.object({
  currentRankIndex: z.number().int().min(0).max(200),
  desiredRankIndex: z.number().int().min(0).max(200),
  currentLpBand: z.union([z.literal(0), z.literal(25), z.literal(50), z.literal(75)]).optional(),
  lpGainBand: z.enum(["normal", "low"]).optional(),
  queue: z.enum(["solo", "flex"]).optional(),
});

const placementsConfigSchema = z.object({
  gamesCount: z.number().int().min(1).max(20),
  previousBand: z.enum(["unranked_low", "mid", "high"]),
});

const netWinsConfigSchema = z.object({
  winsCount: z.number().int().min(1).max(10),
  currentRankIndex: z.number().int().min(0).max(200),
});

const commonFields = {
  gameSlug: gameSlugSchema,
  mode: modeSchema,
  regionCode: z.string().min(1).max(40),
  modifierKeys: z.array(z.string().max(60)).max(20).default([]),
  couponCode: z.string().trim().max(40).optional(),
  applyStoreCredit: z.boolean().optional(),
};

export const quoteRequestSchema = z.discriminatedUnion("serviceType", [
  z.object({ serviceType: z.literal("rank_boost"), config: rankBoostConfigSchema, ...commonFields }),
  z.object({ serviceType: z.literal("placements"), config: placementsConfigSchema, ...commonFields }),
  z.object({ serviceType: z.literal("net_wins"), config: netWinsConfigSchema, ...commonFields }),
]);

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

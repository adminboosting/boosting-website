import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOOSTER_AVAILABILITY_CONFIG,
  fillPerGame,
  parseConfig,
  sumPerGame,
  tallyLiveCounts,
} from "@/lib/boosters/availability";

describe("booster availability — pure helpers", () => {
  it("fills a count for every game, flooring and clamping to >= 0", () => {
    const perGame = fillPerGame({
      "league-of-legends": 5.9,
      valorant: -2,
      // overwatch-2 and marvel-rivals omitted
    });
    expect(perGame).toEqual({
      "league-of-legends": 5,
      valorant: 0,
      "overwatch-2": 0,
      "marvel-rivals": 0,
    });
  });

  it("total is the sum of the per-game counts", () => {
    const perGame = fillPerGame({ "league-of-legends": 5, valorant: 2 });
    expect(sumPerGame(perGame)).toBe(7); // matches the 5 + 2 = 7 model
  });

  it("parses a stored config and rejects junk fields", () => {
    expect(parseConfig({ mode: "live", counts: { valorant: 3, bogus: 9 } })).toEqual({
      mode: "live",
      counts: { valorant: 3 },
    });
    expect(parseConfig(null)).toBe(DEFAULT_BOOSTER_AVAILABILITY_CONFIG);
    expect(parseConfig({ mode: "nonsense" }).mode).toBe("manual");
  });

  it("tallies live counts per game, skipping non-accepting boosters", () => {
    const counts = tallyLiveCounts([
      { games: ["league-of-legends", "valorant"], is_accepting: true },
      { games: ["league-of-legends"], is_accepting: true },
      { games: ["valorant"], is_accepting: false }, // excluded
      { games: ["not-a-game"], is_accepting: true }, // unknown slug ignored
    ]);
    expect(counts["league-of-legends"]).toBe(2);
    expect(counts.valorant).toBe(1);
    expect(counts["overwatch-2"]).toBe(0);
    expect(sumPerGame(counts)).toBe(3);
  });
});

import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_REVIEWER,
  getPublishedReviews,
  mapReviewRow,
  type PublicReviewRow,
} from "@/lib/reviews/public";

/** A complete row in the shape PostgREST returns for M:1 embeds (objects). */
function row(overrides: Partial<PublicReviewRow> = {}): PublicReviewRow {
  return {
    id: "9a9a9a9a-0000-0000-0000-0000000000a1",
    rating: 5,
    body: "Fast climb, great comms.",
    created_at: "2026-07-01T12:00:00.000Z",
    orders: { game_slug: "valorant", service_type: "rank_boost" },
    profiles: { display_name: "Alice Smith" },
    ...overrides,
  };
}

describe("mapReviewRow", () => {
  it("maps a full row, truncating the display name to the first name only", () => {
    expect(mapReviewRow(row())).toEqual({
      id: "9a9a9a9a-0000-0000-0000-0000000000a1",
      rating: 5,
      body: "Fast climb, great comms.",
      createdAt: "2026-07-01T12:00:00.000Z",
      gameSlug: "valorant",
      serviceType: "rank_boost",
      displayName: "Alice",
    });
  });

  it("also accepts array-shaped embeds (PostgREST's alternate join shape)", () => {
    const mapped = mapReviewRow(
      row({
        orders: [{ game_slug: "overwatch-2", service_type: "placements" }],
        profiles: [{ display_name: "Bo" }],
      }),
    );
    expect(mapped.gameSlug).toBe("overwatch-2");
    expect(mapped.serviceType).toBe("placements");
    expect(mapped.displayName).toBe("Bo");
  });

  it(`falls back to "${ANONYMOUS_REVIEWER}" when the display name is null, empty, or whitespace`, () => {
    for (const display_name of [null, "", "   "]) {
      const mapped = mapReviewRow(row({ profiles: { display_name } }));
      expect(mapped.displayName, `display_name=${JSON.stringify(display_name)}`).toBe(
        ANONYMOUS_REVIEWER,
      );
    }
    expect(mapReviewRow(row({ profiles: null })).displayName).toBe(ANONYMOUS_REVIEWER);
    expect(mapReviewRow(row({ profiles: [] })).displayName).toBe(ANONYMOUS_REVIEWER);
  });

  it("trims the display name before truncating to the first token", () => {
    expect(mapReviewRow(row({ profiles: { display_name: "  Cara J Lee " } })).displayName).toBe(
      "Cara",
    );
  });

  it("maps a rating-only review to an empty (trimmed) body", () => {
    expect(mapReviewRow(row({ body: null })).body).toBe("");
    expect(mapReviewRow(row({ body: "  ok  " })).body).toBe("ok");
  });

  it("never throws on missing embeds — game/service go null and the page drops the chip", () => {
    const mapped = mapReviewRow(row({ orders: null }));
    expect(mapped.gameSlug).toBeNull();
    expect(mapped.serviceType).toBeNull();
    const arrayEmpty = mapReviewRow(row({ orders: [] }));
    expect(arrayEmpty.gameSlug).toBeNull();
    expect(arrayEmpty.serviceType).toBeNull();
  });
});

describe("getPublishedReviews", () => {
  it("returns [] in the hermetic suite (no service-role env) instead of throwing", async () => {
    // vitest.config.ts blanks the Supabase env, so the admin client cannot be
    // constructed — the /reviews page must degrade to its sample fallback.
    await expect(getPublishedReviews()).resolves.toEqual([]);
  });
});

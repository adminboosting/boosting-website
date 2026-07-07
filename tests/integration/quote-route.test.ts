import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/quote/route";

function post(body: unknown): Request {
  return new Request("http://localhost/api/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/quote", () => {
  it("returns a server-computed quote for a valid request", async () => {
    const res = await POST(
      post({
        gameSlug: "league-of-legends",
        serviceType: "rank_boost",
        mode: "piloted",
        regionCode: "na",
        modifierKeys: [],
        config: { currentRankIndex: 11, desiredRankIndex: 12 }, // Silver I -> Gold IV
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { quote: { totalCents: number } };
    expect(json.quote.totalCents).toBe(1800);
  });

  it("ignores a client-supplied total (server is authoritative)", async () => {
    const res = await POST(
      post({
        gameSlug: "league-of-legends",
        serviceType: "rank_boost",
        mode: "piloted",
        regionCode: "na",
        modifierKeys: [],
        config: { currentRankIndex: 11, desiredRankIndex: 12 },
        // Attacker-supplied fields that must be ignored by the schema/engine:
        totalCents: 1,
        baseCents: 1,
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { quote: { totalCents: number } };
    expect(json.quote.totalCents).toBe(1800);
  });

  it("rejects an invalid body with 400", async () => {
    const res = await POST(post({ gameSlug: "halo", serviceType: "rank_boost" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 with a code for a pricing rejection (desired <= current)", async () => {
    const res = await POST(
      post({
        gameSlug: "league-of-legends",
        serviceType: "rank_boost",
        mode: "piloted",
        regionCode: "na",
        modifierKeys: [],
        config: { currentRankIndex: 15, desiredRankIndex: 12 },
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code?: string };
    expect(json.code).toBe("invalid_range");
  });
});

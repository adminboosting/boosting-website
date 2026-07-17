import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_FEATURES, activeAiFeaturePath } from "@/lib/ai/features";
import { suggestFaqs } from "@/lib/ai/faq-suggest";
import { isAiEnabled } from "@/lib/ai/gate";
import { MODERATION_FLAGS, getReviewModerationFlags } from "@/lib/ai/moderation";
import { summarizeOrder } from "@/lib/ai/order-summary";
import { getQuickReplies, type QuickReplyRole } from "@/lib/ai/quick-replies";
import type { Rank } from "@/lib/catalog/types";
import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from "@/lib/orders/transitions";

/**
 * The deterministic fallbacks behind the five AI features (lib/ai/features.ts).
 * All pure modules — this suite runs in the hermetic fast lane (`pnpm test`).
 */

describe("gate: isAiEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is false when nothing is configured", () => {
    vi.stubEnv("AI_FEATURES_ENABLED", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(isAiEnabled()).toBe(false);
  });

  it("is false when the flag is on but the key is missing", () => {
    vi.stubEnv("AI_FEATURES_ENABLED", "true");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(isAiEnabled()).toBe(false);
  });

  it("is false when the key exists but the flag is off (off by default)", () => {
    vi.stubEnv("AI_FEATURES_ENABLED", "false");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    expect(isAiEnabled()).toBe(false);
  });

  it("is true only with flag=true AND a key", () => {
    vi.stubEnv("AI_FEATURES_ENABLED", "true");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    expect(isAiEnabled()).toBe(true);
  });

  it("reports the deterministic path while disabled", () => {
    vi.stubEnv("AI_FEATURES_ENABLED", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(activeAiFeaturePath()).toBe("deterministic");
  });
});

describe("features registry", () => {
  it("names exactly the five promised features", () => {
    expect(AI_FEATURES.map((f) => f.key)).toEqual([
      "smart_eta",
      "review_moderation",
      "order_summary",
      "faq_suggestions",
      "chat_quick_replies",
    ]);
  });

  it("points every feature at a deterministic implementation", () => {
    for (const feature of AI_FEATURES) {
      expect(feature.deterministicImpl, feature.key).toMatch(/lib\//);
    }
  });
});

describe("moderation: getReviewModerationFlags", () => {
  it("returns [] for a clean review", () => {
    expect(
      getReviewModerationFlags("Smooth boost, great communication, hit my rank two days early.", 5),
    ).toEqual([]);
  });

  it("flags links and URLs", () => {
    expect(
      getReviewModerationFlags("Best service, check https://spam.example.com now", 5),
    ).toContain(MODERATION_FLAGS.link);
    expect(getReviewModerationFlags("Visit www.cheap-elo.example for cheaper prices", 5)).toContain(
      MODERATION_FLAGS.link,
    );
  });

  it("flags contact info (email, phone, messenger)", () => {
    expect(getReviewModerationFlags("great run, hit me at pro@boost.example", 5)).toContain(
      MODERATION_FLAGS.contactInfo,
    );
    expect(getReviewModerationFlags("call me on 415-555-0123 for private orders", 5)).toContain(
      MODERATION_FLAGS.contactInfo,
    );
    expect(getReviewModerationFlags("add me on discord for a private deal", 5)).toContain(
      MODERATION_FLAGS.contactInfo,
    );
  });

  it("flags ALL-CAPS shouting", () => {
    expect(getReviewModerationFlags("ABSOLUTELY AMAZING SERVICE WOW", 5)).toContain(
      MODERATION_FLAGS.allCaps,
    );
  });

  it("does not flag ordinary capitalization as shouting", () => {
    expect(
      getReviewModerationFlags("My booster was GREAT and finished a day early. Thanks!", 5),
    ).toEqual([]);
  });

  it("flags sub-10-character bodies", () => {
    expect(getReviewModerationFlags("gg", 5)).toContain(MODERATION_FLAGS.shortBody);
    expect(getReviewModerationFlags("   gg    ", 5)).toContain(MODERATION_FLAGS.shortBody);
  });

  it("flags profanity on word boundaries only", () => {
    expect(
      getReviewModerationFlags("the first booster was shit but support fixed it fast", 3),
    ).toContain(MODERATION_FLAGS.profanity);
    // Scunthorpe guard: substrings inside clean words don't fire.
    expect(
      getReviewModerationFlags("A classic clutch performance, highly recommended.", 5),
    ).toEqual([]);
  });

  it("flags low ratings for a closer read", () => {
    expect(getReviewModerationFlags("Slow start and poor communication overall.", 2)).toEqual([
      MODERATION_FLAGS.lowRating,
    ]);
    expect(getReviewModerationFlags("Decent but not fast enough for the price.", 3)).toEqual([]);
  });

  it("stacks multiple flags", () => {
    const flags = getReviewModerationFlags("www.x.io", 1);
    expect(flags).toContain(MODERATION_FLAGS.shortBody);
    expect(flags).toContain(MODERATION_FLAGS.link);
    expect(flags).toContain(MODERATION_FLAGS.lowRating);
  });
});

describe("faq-suggest: suggestFaqs", () => {
  const FAQS = [
    { question: "Can I get a refund?", answer: "Full refund before work begins, pro-rated after." },
    { question: "How long will my order take?", answer: "Every configuration shows a time range." },
    { question: "Is boosting safe?", answer: "Manual play and encrypted credentials." },
    { question: "How do payments work?", answer: "Crypto-first via NOWPayments." },
  ];

  it("ranks question-keyword matches above answer-only matches", () => {
    const result = suggestFaqs("how do refunds work", FAQS);
    // "refund" hits FAQ 0's question (2) + "work" its answer (1) = 3;
    // "work" hits FAQ 3's question (2) = 2.
    expect(result[0]).toBe(FAQS[0]);
    expect(result[1]).toBe(FAQS[3]);
  });

  it("matches plural query words against singular FAQ words", () => {
    expect(suggestFaqs("payments", FAQS)[0]).toBe(FAQS[3]);
  });

  it("returns [] for an empty query", () => {
    expect(suggestFaqs("", FAQS)).toEqual([]);
    expect(suggestFaqs("   ", FAQS)).toEqual([]);
  });

  it("returns [] for a stopword-only query", () => {
    expect(suggestFaqs("how can you", FAQS)).toEqual([]);
  });

  it("returns [] when nothing overlaps", () => {
    expect(suggestFaqs("elephant sandwiches", FAQS)).toEqual([]);
  });

  it("respects the limit", () => {
    const result = suggestFaqs("refund payments safe time order", FAQS, 2);
    expect(result).toHaveLength(2);
  });

  it("breaks ties by original FAQ order", () => {
    const tied = [
      { question: "About coupons", answer: "Coupons stack with loyalty." },
      { question: "More coupons", answer: "Coupon codes at checkout." },
    ];
    expect(suggestFaqs("coupons", tied)).toEqual([tied[0], tied[1]]);
  });
});

describe("order-summary: summarizeOrder", () => {
  const NOW = Date.parse("2026-07-16T12:00:00Z");
  const DAY = 24 * 60 * 60 * 1000;

  const rank = (label: string, sortIndex: number): Rank => ({
    gameSlug: "league-of-legends",
    tier: label.split(" ")[0] ?? label,
    division: 0,
    label,
    sortIndex,
    climbPriceCents: 1000,
    climbEtaHours: 4,
    isPurchasable: true,
  });

  it("renders the rank-boost template with labels, status, money, and ages", () => {
    const summary = summarizeOrder(
      {
        gameName: "League of Legends",
        serviceType: "rank_boost",
        mode: "duo",
        status: "in_progress",
        config: { currentRankIndex: 10, desiredRankIndex: 14 },
        totalCents: 5430,
        createdAt: new Date(NOW - 4 * DAY).toISOString(),
        ranks: [rank("Gold IV", 10), rank("Platinum II", 14)],
      },
      { note: "Won 3 games", createdAt: new Date(NOW - 2 * DAY).toISOString() },
      NOW,
    );
    expect(summary).toBe(
      "League of Legends — Gold IV → Platinum II duo boost · in progress · $54.30 total · placed 4d ago · last update 2d ago (“Won 3 games”).",
    );
  });

  it("degrades to a generic descriptor without rank labels", () => {
    const summary = summarizeOrder(
      {
        gameName: "Valorant",
        serviceType: "rank_boost",
        mode: "piloted",
        status: "paid",
        config: { currentRankIndex: 3, desiredRankIndex: 7 },
        totalCents: 2000,
        createdAt: new Date(NOW - 30 * 60_000).toISOString(),
      },
      null,
      NOW,
    );
    expect(summary).toContain("piloted rank boost");
    expect(summary).toContain("placed 30m ago");
    expect(summary).toContain("no progress updates yet");
  });

  it("describes placements and net wins from their configs", () => {
    const placements = summarizeOrder(
      {
        gameName: "Overwatch 2",
        serviceType: "placements",
        mode: "piloted",
        status: "assigned",
        config: { gamesCount: 5, previousBand: "mid" },
        totalCents: 4000,
        createdAt: new Date(NOW - 3 * 60 * 60_000).toISOString(),
      },
      null,
      NOW,
    );
    expect(placements).toContain("5-game placements (piloted)");
    expect(placements).toContain("placed 3h ago");

    const netWins = summarizeOrder(
      {
        gameName: "Marvel Rivals",
        serviceType: "net_wins",
        mode: "duo",
        status: "completed",
        config: { winsCount: 10, currentRankIndex: 6 },
        totalCents: 9900,
        createdAt: new Date(NOW - DAY).toISOString(),
      },
      null,
      NOW,
    );
    expect(netWins).toContain("10 net wins (duo)");
    expect(netWins).toContain("completed");
  });

  it("truncates long progress notes and survives noteless progress", () => {
    const longNote = "w".repeat(120);
    const summary = summarizeOrder(
      {
        gameName: "Valorant",
        serviceType: "net_wins",
        mode: "duo",
        status: "in_progress",
        config: { winsCount: 3, currentRankIndex: 2 },
        totalCents: 1500,
        createdAt: new Date(NOW - DAY).toISOString(),
      },
      { note: longNote, createdAt: new Date(NOW - 10 * 60_000).toISOString() },
      NOW,
    );
    expect(summary).toContain("…");
    expect(summary).not.toContain(longNote);
    expect(summary).toContain("last update 10m ago");

    const noteless = summarizeOrder(
      {
        gameName: "Valorant",
        serviceType: "net_wins",
        mode: "duo",
        status: "in_progress",
        config: { winsCount: 3, currentRankIndex: 2 },
        totalCents: 1500,
        createdAt: new Date(NOW - DAY).toISOString(),
      },
      { note: null, createdAt: new Date(NOW - 60_000).toISOString() },
      NOW,
    );
    expect(noteless).toContain("last update 1m ago");
    expect(noteless).not.toContain("(“");
  });

  it("clamps future/garbage timestamps to 'just now'", () => {
    const summary = summarizeOrder(
      {
        gameName: "Valorant",
        serviceType: "net_wins",
        mode: "duo",
        status: "paid",
        config: { winsCount: 1, currentRankIndex: 0 },
        totalCents: 500,
        createdAt: new Date(NOW + DAY).toISOString(),
      },
      null,
      NOW,
    );
    expect(summary).toContain("placed just now");
  });
});

describe("quick-replies: getQuickReplies", () => {
  const ALL_STATUSES = Object.keys(ORDER_STATUS_TRANSITIONS) as OrderStatus[];
  const ROLES: QuickReplyRole[] = ["customer", "booster", "admin"];

  it("returns at least one canned reply for every status × role", () => {
    for (const status of ALL_STATUSES) {
      for (const role of ROLES) {
        const replies = getQuickReplies(status, role);
        expect(replies.length, `${status}/${role}`).toBeGreaterThan(0);
        for (const reply of replies) {
          expect(reply.trim().length, `${status}/${role}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps replies role-appropriate on the hot path", () => {
    expect(getQuickReplies("in_progress", "customer")).toContain("How is the order going?");
    expect(getQuickReplies("assigned", "booster")).toContain(
      "Hi, I'm your booster — I'll start on your order shortly.",
    );
  });

  it("is deterministic (same input, same output)", () => {
    expect(getQuickReplies("paused", "admin")).toEqual(getQuickReplies("paused", "admin"));
  });
});

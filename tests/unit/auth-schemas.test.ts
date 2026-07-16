import { describe, expect, it } from "vitest";
import { credentialSubmissionSchema, signInSchema, signUpSchema } from "@/lib/schemas/auth";
import { checkoutRequestSchema } from "@/lib/schemas/checkout";

describe("signUpSchema", () => {
  it("accepts a valid sign-up payload", () => {
    const parsed = signUpSchema.parse({
      email: "frog@rankedfrogs.com",
      password: "hopalong-1",
      displayName: "  Kermit  ",
    });
    expect(parsed.email).toBe("frog@rankedfrogs.com");
    expect(parsed.displayName).toBe("Kermit"); // trimmed
  });

  it("accepts a payload without the optional displayName", () => {
    expect(
      signUpSchema.safeParse({ email: "frog@rankedfrogs.com", password: "hopalong-1" }).success,
    ).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(
      signUpSchema.safeParse({ email: "not-an-email", password: "hopalong-1" }).success,
    ).toBe(false);
  });

  it("rejects an overlong email (> 254 chars)", () => {
    const email = `${"a".repeat(250)}@x.io`;
    expect(signUpSchema.safeParse({ email, password: "hopalong-1" }).success).toBe(false);
  });

  it("rejects a password shorter than 8 chars", () => {
    expect(
      signUpSchema.safeParse({ email: "frog@rankedfrogs.com", password: "short7!" }).success,
    ).toBe(false);
  });

  it("rejects a password longer than 72 chars (bcrypt limit)", () => {
    expect(
      signUpSchema.safeParse({ email: "frog@rankedfrogs.com", password: "p".repeat(73) }).success,
    ).toBe(false);
  });

  it("rejects a displayName longer than 60 chars", () => {
    expect(
      signUpSchema.safeParse({
        email: "frog@rankedfrogs.com",
        password: "hopalong-1",
        displayName: "d".repeat(61),
      }).success,
    ).toBe(false);
  });
});

describe("signInSchema", () => {
  it("accepts a valid sign-in payload", () => {
    expect(
      signInSchema.safeParse({ email: "frog@rankedfrogs.com", password: "hopalong-1" }).success,
    ).toBe(true);
  });

  it("rejects a missing password", () => {
    expect(signInSchema.safeParse({ email: "frog@rankedfrogs.com" }).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(signInSchema.safeParse({ email: "frog@", password: "hopalong-1" }).success).toBe(false);
  });
});

describe("credentialSubmissionSchema", () => {
  it("accepts a valid submission and trims the username", () => {
    const parsed = credentialSubmissionSchema.parse({
      username: "  SummonerName#NA1  ",
      password: "account-pass",
      note: "Do not touch ranked flex.",
    });
    expect(parsed.username).toBe("SummonerName#NA1");
  });

  it("accepts a submission without the optional note", () => {
    expect(
      credentialSubmissionSchema.safeParse({ username: "frog", password: "x" }).success,
    ).toBe(true);
  });

  it("rejects a whitespace-only username", () => {
    expect(
      credentialSubmissionSchema.safeParse({ username: "   ", password: "account-pass" }).success,
    ).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(
      credentialSubmissionSchema.safeParse({ username: "frog", password: "" }).success,
    ).toBe(false);
  });

  it("rejects an overlong note (> 500 chars)", () => {
    expect(
      credentialSubmissionSchema.safeParse({
        username: "frog",
        password: "account-pass",
        note: "n".repeat(501),
      }).success,
    ).toBe(false);
  });
});

describe("checkoutRequestSchema", () => {
  const validPayload = {
    gameSlug: "league-of-legends",
    serviceType: "rank_boost",
    mode: "piloted",
    regionCode: "na",
    modifierKeys: [],
    config: { currentRankIndex: 11, desiredRankIndex: 12 },
  };

  it("accepts a valid quote-shaped payload", () => {
    expect(checkoutRequestSchema.safeParse(validPayload).success).toBe(true);
  });

  it("strips attacker-supplied price fields (server is authoritative)", () => {
    const parsed = checkoutRequestSchema.parse({
      ...validPayload,
      // Money-bearing fields that must never survive parsing:
      totalCents: 1,
      subtotalCents: 1,
      discountCents: 999999,
    });
    expect(parsed).not.toHaveProperty("totalCents");
    expect(parsed).not.toHaveProperty("subtotalCents");
    expect(parsed).not.toHaveProperty("discountCents");
  });

  it("rejects an unknown game slug", () => {
    expect(checkoutRequestSchema.safeParse({ ...validPayload, gameSlug: "halo" }).success).toBe(
      false,
    );
  });
});

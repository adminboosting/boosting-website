import { describe, expect, it } from "vitest";
import {
  generateReferralCode,
  normalizeReferralCode,
  REFERRAL_CODE_LENGTH,
  REFERRAL_REWARD_CENTS,
} from "@/lib/referrals/core";

describe("REFERRAL_REWARD_CENTS", () => {
  it("is $5 in integer cents", () => {
    expect(REFERRAL_REWARD_CENTS).toBe(500);
    expect(Number.isInteger(REFERRAL_REWARD_CENTS)).toBe(true);
  });
});

describe("generateReferralCode", () => {
  it("emits 8 uppercase base32 characters (A–Z, 2–7)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode();
      expect(code).toHaveLength(REFERRAL_CODE_LENGTH);
      expect(code).toMatch(/^[A-Z2-7]{8}$/);
    }
  });

  it("every generated code survives its own normalizer unchanged", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateReferralCode();
      expect(normalizeReferralCode(code)).toBe(code);
    }
  });

  it("does not repeat across a small sample (32^8 space)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateReferralCode());
    expect(seen.size).toBe(500);
  });
});

describe("normalizeReferralCode", () => {
  it("trims and uppercases plausible codes", () => {
    expect(normalizeReferralCode("  frog4you ")).toBe("FROG4YOU");
    expect(normalizeReferralCode("AbCd1234")).toBe("ABCD1234");
    expect(normalizeReferralCode("REFER99")).toBe("REFER99");
  });

  it("accepts the 4- and 16-char boundaries", () => {
    expect(normalizeReferralCode("AB12")).toBe("AB12");
    expect(normalizeReferralCode("A".repeat(16))).toBe("A".repeat(16));
  });

  it("rejects junk with null (never throws)", () => {
    expect(normalizeReferralCode("")).toBeNull();
    expect(normalizeReferralCode("   ")).toBeNull();
    expect(normalizeReferralCode("AB1")).toBeNull(); // too short
    expect(normalizeReferralCode("A".repeat(17))).toBeNull(); // too long
    expect(normalizeReferralCode("ABC-123")).toBeNull(); // punctuation
    expect(normalizeReferralCode("ABC 123")).toBeNull(); // inner whitespace
    expect(normalizeReferralCode("abc_123")).toBeNull(); // underscore
    expect(normalizeReferralCode("ＦＲＯＧ４Ｕ")).toBeNull(); // full-width unicode
    expect(normalizeReferralCode("code\n1234")).toBeNull(); // newline
  });
});

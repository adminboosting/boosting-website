/**
 * Referral program — pure core. No "server-only", no supabase imports, so the
 * fast suite tests it directly (tests/unit/referrals-core.test.ts) and both the
 * sign-up page (code normalization) and the service layer share one source of
 * truth for code shape and the reward amount.
 *
 * Data model (supabase/migrations/0004_commerce.sql): `referrals.code` is
 * UNIQUE per ROW and each row holds at most one `referred_id`. A user's
 * shareable code therefore lives on a "share row" (`referred_id` null) that is
 * never claimed; every successful signup gets its OWN attribution row with a
 * freshly generated code. Do not "simplify" to updating the share row — the
 * second referral would have nowhere to go (plan risk #4).
 */
import { randomBytes } from "node:crypto";

/**
 * Fixed referral reward, integer cents ($5 store credit to the referrer when
 * the referred customer's first manual payment is confirmed). A const, not a
 * settings key — recorded in DECISIONS.md.
 */
export const REFERRAL_REWARD_CENTS = 500;

/** Length of every generated code (share and attribution rows alike). */
export const REFERRAL_CODE_LENGTH = 8;

// RFC 4648 base32 alphabet: 32 symbols, so `byte & 31` maps a random byte
// uniformly (256 % 32 === 0 — no modulo bias).
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * 8-char uppercase base32 code from CSPRNG bytes. 32^8 ≈ 1.1e12 values — a
 * duplicate is a unique-violation retry, not a design concern.
 */
export function generateReferralCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let code = "";
  for (const byte of bytes) {
    code += BASE32_ALPHABET[byte & 31]!;
  }
  return code;
}

// Accepts slightly more than we generate (any A–Z/0–9, 4–16 chars) so codes
// hand-typed from a shared link survive casing and whitespace; everything else
// is junk and never reaches the database.
const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{4,16}$/;

/**
 * Trim + uppercase a user-supplied referral code; null when the result is not
 * a plausible code. Callers treat null as "no referral", never as an error —
 * a bad code must not disturb sign-up.
 */
export function normalizeReferralCode(input: string): string | null {
  const normalized = input.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(normalized) ? normalized : null;
}

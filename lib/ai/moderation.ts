/**
 * Deterministic review-moderation assist — AI feature "review_moderation"
 * (lib/ai/features.ts). Pure module: no env, no supabase, fast-suite tested.
 *
 * Flags are advisory strings rendered in the /admin/reviews queue. They never
 * block publishing — the admin decides; the assist just points at the usual
 * reasons to look twice. False positives (an order id reading as a phone
 * number, an enthusiastic caps-lock fan) are acceptable at this altitude.
 */

const URL_PATTERN = /(https?:\/\/|www\.)\S+/i;

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/** 7+ digits in a row, allowing common separators — reads as a phone number. */
const PHONE_PATTERN = /\d(?:[\s().-]?\d){6,}/;

/** Solicitations to move the conversation off-platform. */
const MESSENGER_PATTERN = /\b(discord|telegram|whatsapp|skype|snapchat)\b/i;

/** Small, word-boundary-matched list — an assist, not a filter. */
const PROFANITY_PATTERN =
  /\b(fuck|fucking|fucked|shit|shitty|bitch|asshole|cunt|bastard|dickhead)\b/i;

/** Caps heuristic: enough letters to be a sentence, overwhelmingly uppercase. */
const CAPS_MIN_LETTERS = 12;
const CAPS_MIN_RATIO = 0.7;

/**
 * Flag strings are part of the admin UI contract (rendered verbatim by
 * app/(admin)/admin/reviews) and asserted by tests/unit/ai-fallbacks.test.ts.
 */
export const MODERATION_FLAGS = {
  shortBody: "Very short body (under 10 characters)",
  link: "Contains a link or URL",
  contactInfo: "Contains contact info (email, phone, or messenger handle)",
  allCaps: "Mostly ALL-CAPS (shouting)",
  profanity: "Contains profanity",
  lowRating: "Low rating (1–2 stars) — read before publishing",
} as const;

function isMostlyCaps(body: string): boolean {
  const letters = body.match(/[a-zA-Z]/g) ?? [];
  if (letters.length < CAPS_MIN_LETTERS) return false;
  const upper = letters.filter((ch) => ch >= "A" && ch <= "Z").length;
  return upper / letters.length >= CAPS_MIN_RATIO;
}

/**
 * Deterministic moderation flags for one review. Returns [] for a clean
 * review. Signature is an import contract with the admin reviews surface —
 * do not change it without updating app/(admin)/admin/reviews.
 */
export function getReviewModerationFlags(body: string, rating: number): string[] {
  const trimmed = body.trim();
  const flags: string[] = [];

  if (trimmed.length < 10) flags.push(MODERATION_FLAGS.shortBody);
  if (URL_PATTERN.test(trimmed)) flags.push(MODERATION_FLAGS.link);
  if (
    EMAIL_PATTERN.test(trimmed) ||
    PHONE_PATTERN.test(trimmed) ||
    MESSENGER_PATTERN.test(trimmed)
  ) {
    flags.push(MODERATION_FLAGS.contactInfo);
  }
  if (isMostlyCaps(trimmed)) flags.push(MODERATION_FLAGS.allCaps);
  if (PROFANITY_PATTERN.test(trimmed)) flags.push(MODERATION_FLAGS.profanity);
  if (rating <= 2) flags.push(MODERATION_FLAGS.lowRating);

  return flags;
}

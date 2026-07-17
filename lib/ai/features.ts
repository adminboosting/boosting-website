import { isAiEnabled } from "@/lib/ai/gate";

/**
 * Registry of the five AI features the README promises ("scaffolded, off by
 * default, deterministic fallbacks"). This module is the canonical naming —
 * README and tests reference it so the claim can never drift from the code.
 *
 * Every deterministic path is a pure, fast-suite-tested function. The AI path
 * is deliberately unimplemented this phase: `activeAiFeaturePath()` reports
 * which side would run, and flipping env later swaps implementations inside
 * each module without touching call sites (see lib/ai/gate.ts).
 */

export type AiFeatureKey =
  "smart_eta" | "review_moderation" | "order_summary" | "faq_suggestions" | "chat_quick_replies";

export interface AiFeature {
  key: AiFeatureKey;
  name: string;
  /** Where the deterministic implementation lives. */
  deterministicImpl: string;
  /** Where it is surfaced in the app (or why it deliberately is not). */
  surface: string;
}

export const AI_FEATURES: readonly AiFeature[] = [
  {
    key: "smart_eta",
    name: "Smart ETA",
    deterministicImpl: "lib/pricing/engine.ts (etaHours on every quote)",
    surface: "calculator quote breakdown + order pages",
  },
  {
    key: "review_moderation",
    name: "Review moderation assist",
    deterministicImpl: "lib/ai/moderation.ts#getReviewModerationFlags",
    surface: "/admin/reviews moderation queue",
  },
  {
    key: "order_summary",
    name: "Order summary",
    deterministicImpl: "lib/ai/order-summary.ts#summarizeOrder",
    surface: "/admin/orders/[id] one-line summary",
  },
  {
    key: "faq_suggestions",
    name: "FAQ answer suggestions",
    deterministicImpl: "lib/ai/faq-suggest.ts#suggestFaqs",
    surface: "/contact Common answers section",
  },
  {
    key: "chat_quick_replies",
    name: "Chat quick replies",
    deterministicImpl: "lib/ai/quick-replies.ts#getQuickReplies",
    surface: "not wired — deliberate Phase 4 cut (see DECISIONS.md)",
  },
];

export type AiFeaturePath = "deterministic" | "ai (not yet implemented — falls back)";

/** Which implementation path features would take right now. */
export function activeAiFeaturePath(): AiFeaturePath {
  return isAiEnabled() ? "ai (not yet implemented — falls back)" : "deterministic";
}

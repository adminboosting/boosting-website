/**
 * The single on/off switch for the five "AI" features (lib/ai/features.ts).
 *
 * No Anthropic client exists yet — this phase ships only the deterministic
 * fallbacks. The gate exists so flipping env later swaps implementations
 * without touching call sites: every surface calls the deterministic function
 * today, and an AI-backed implementation would branch on this gate inside the
 * same module.
 *
 * Pure env read (no "server-only") so the fast suite can test it — but the
 * inputs are server secrets, so never call this from a client component.
 */
export function isAiEnabled(): boolean {
  return process.env.AI_FEATURES_ENABLED === "true" && !!process.env.ANTHROPIC_API_KEY;
}

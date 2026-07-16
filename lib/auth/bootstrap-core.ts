/**
 * Admin-bootstrap decision core. Pure module (no "server-only", no supabase
 * imports) so the hermetic fast suite can test the matching rule directly;
 * the effectful promotion lives in lib/auth/bootstrap.ts.
 */

/**
 * True when `email` matches the ADMIN_BOOTSTRAP_EMAIL value (`bootstrapEmail`)
 * — case-insensitive, whitespace-trimmed. False whenever either side is
 * missing or blank: an unset variable means the feature is OFF, never
 * "promote anyone".
 */
export function shouldBootstrap(
  email: string | null | undefined,
  bootstrapEmail: string | null | undefined,
): boolean {
  const candidate = email?.trim().toLowerCase();
  const target = bootstrapEmail?.trim().toLowerCase();
  return Boolean(candidate && target && candidate === target);
}

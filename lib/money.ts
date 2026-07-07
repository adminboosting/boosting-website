/**
 * Money helpers. All money in the system is integer cents, USD. Formatting to a
 * human string happens only at the UI edge (never store or compute on the string).
 */

/**
 * Round to the nearest integer, half-up (0.5 -> 1). All pricing values are
 * non-negative before rounding, so this is the correct rounding for cents after
 * a multiply by a rate.
 */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/** Apply a basis-points rate to a cents amount, rounded half-up. */
export function applyBp(cents: number, bp: number): number {
  return roundHalfUp((cents * bp) / 10000);
}

/** Format integer cents as a USD string, e.g. 1875 -> "$18.75". */
export function formatUsdFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

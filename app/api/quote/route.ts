import { NextResponse } from "next/server";
import { buildPricingContext } from "@/lib/catalog/data";
import { computeQuote } from "@/lib/pricing/engine";
import { PricingError, type QuoteInput } from "@/lib/pricing/types";
import { quoteRequestSchema } from "@/lib/schemas/quote";

/**
 * Server-authoritative price quote. The client sends only selections; this route
 * validates them and computes the price via the pure engine. The client's own
 * total is never trusted. Pricing is recomputed again at order creation (Phase 2).
 *
 * Catalog source: the static catalog today (works with zero backend). Once
 * Supabase is wired this swaps to a DB-backed context loader with the static
 * catalog as fallback — the engine is agnostic to the source.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data as QuoteInput;

  try {
    // account is null for anonymous quotes; Phase 2 attaches the signed-in
    // customer's loyalty tier + store-credit balance server-side.
    const ctx = buildPricingContext(input.gameSlug, input.serviceType, {
      couponCode: input.couponCode,
      account: null,
    });
    const quote = computeQuote(input, ctx);
    return NextResponse.json(
      { quote },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof PricingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    throw error;
  }
}

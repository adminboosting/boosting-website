import { NextResponse } from "next/server";
import { getLoyaltyTierForSpend } from "@/lib/catalog/data";
import { getPricingContext } from "@/lib/catalog/source";
import type { AccountPricingContext } from "@/lib/catalog/types";
import { computeQuote } from "@/lib/pricing/engine";
import { PricingError, type QuoteInput } from "@/lib/pricing/types";
import { quoteRequestSchema } from "@/lib/schemas/quote";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Anonymous quotes get account: null. Signed-in customers get their loyalty
 * tier + store credit attached so the public calculator and checkout agree.
 * Dynamically imported because lib/auth/session pulls "server-only", which the
 * hermetic fast suite (Supabase env blanked) cannot resolve — the gate keeps
 * that import out of the test graph entirely.
 */
async function getAccountContext(): Promise<AccountPricingContext | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { getSessionProfile } = await import("@/lib/auth/session");
    const session = await getSessionProfile();
    if (!session) return null;
    const tier = getLoyaltyTierForSpend(session.profile.lifetime_spend_cents);
    return {
      loyaltyDiscountBp: tier.discountBp,
      loyaltyCashbackBp: tier.cashbackBp,
      storeCreditCents: session.profile.store_credit_cents,
    };
  } catch {
    return null; // a broken session must never break public quoting
  }
}

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
    const ctx = await getPricingContext(input.gameSlug, input.serviceType, {
      couponCode: input.couponCode,
      account: await getAccountContext(),
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

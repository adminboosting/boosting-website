"use server";

import { redirect } from "next/navigation";
import { getSessionProfile, requireUser } from "@/lib/auth/session";
import { getLoyaltyTierForSpend } from "@/lib/catalog/data";
import { getPricingContext } from "@/lib/catalog/source";
import { computeQuote } from "@/lib/pricing/engine";
import { PricingError, type Quote, type QuoteInput } from "@/lib/pricing/types";
import { checkoutRequestSchema } from "@/lib/schemas/checkout";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Order creation. The client sends ONLY its selections (a QuoteRequest); every
 * money column is recomputed here through the same pure engine /api/quote uses,
 * so a tampered client can never set a price. The proxy middleware only
 * redirects — this action re-verifies identity itself, and RLS
 * (`orders_insert_own`) is the final layer underneath.
 */

/** Returned to the client only on failure; success redirects to the order. */
export interface CreateOrderResult {
  error: string;
  code?: string;
}

export async function createOrder(payload: unknown): Promise<CreateOrderResult> {
  // (1) Identity — independent of the proxy. redirect() inside requireUser
  // throws NEXT_REDIRECT, deliberately outside any try/catch.
  const user = await requireUser();

  // The manual-payment flow writes payments/audit/ledger rows via the service
  // role (authenticated has no insert grant on those tables) — refuse up front
  // on a half-configured deploy rather than strand an order with no payment row.
  if (!isServiceRoleConfigured()) {
    return { error: "Checkout isn't enabled on this deployment yet." };
  }

  // (2) Validate the selections. The payload IS a QuoteRequest — anything
  // money-bearing the client might send is rejected here, exactly like /api/quote.
  const parsed = checkoutRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: "Your checkout session looks stale — rebuild your order in the calculator." };
  }
  const input = parsed.data as QuoteInput;

  // The profile carries the loyalty + store-credit context for the re-quote.
  const session = await getSessionProfile();
  if (!session) {
    return { error: "Your account is still being set up — try again in a moment." };
  }
  const { profile } = session;

  // (3) Server-authoritative re-quote with the signed-in account attached.
  // Client-sent numbers are never read; the quote is the only money source.
  let quote: Quote;
  let couponCode: string | null = null;
  try {
    const tier = getLoyaltyTierForSpend(profile.lifetime_spend_cents);
    const ctx = await getPricingContext(input.gameSlug, input.serviceType, {
      couponCode: input.couponCode,
      account: {
        loyaltyDiscountBp: tier.discountBp,
        loyaltyCashbackBp: tier.cashbackBp,
        storeCreditCents: profile.store_credit_cents,
      },
    });
    quote = computeQuote(input, ctx);
    // orders.coupon_code is a FK to coupons(code): persist only a code the
    // catalog actually recognized — unknown codes merely warn in the quote.
    couponCode = ctx.coupon?.code ?? null;
  } catch (error) {
    if (error instanceof PricingError) return { error: error.message, code: error.code };
    throw error;
  }

  // (4) Insert the order with the USER-SCOPED client — RLS `orders_insert_own`
  // proves user_id = auth.uid(). Money columns come straight from the quote;
  // config stores the parsed camelCase QuoteConfig verbatim (see DECISIONS).
  const supabase = await createClient();
  const { data, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: user.id,
      game_slug: input.gameSlug,
      service_type: input.serviceType,
      mode: input.mode,
      region_code: input.regionCode,
      config: input.config,
      subtotal_cents: quote.baseCents + quote.modifiersCents,
      discount_cents: quote.discountCents,
      store_credit_applied_cents: quote.storeCreditAppliedCents,
      total_cents: quote.totalCents,
      currency: quote.currency,
      eta_hours: quote.etaHours,
      coupon_code: couponCode,
    })
    .select("id")
    .single();

  const orderId = (data as { id: string } | null)?.id;
  if (orderError || !orderId) {
    // 23503 = foreign-key violation. The only user-fixable case is a coupon
    // the DB doesn't know (the file-catalog fallback can drift from the table).
    if (orderError?.code === "23503") {
      return { error: "That coupon code isn't valid.", code: "invalid_coupon" };
    }
    return { error: "Couldn't place your order — try again." };
  }

  // (5) Service-role writes: the payment shell for the manual flow, the audit
  // trail, and the store-credit spend. supabase-js errors are non-throwing;
  // the order row is already committed, so failures here log and degrade
  // rather than abort the redirect (the admin queue recovers manually).
  const admin = createAdminClient();

  const { error: paymentError } = await admin.from("payments").insert({
    order_id: orderId,
    provider: "manual",
    amount_cents: quote.totalCents,
    currency: quote.currency,
    status: "created",
  });
  if (paymentError) {
    console.error(`[checkout] payments insert failed for order ${orderId}:`, paymentError.message);
  }

  // Best-effort audit trail; the order stands even if this insert fails.
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "order.created",
    entity: "orders",
    entity_id: orderId,
    meta: { total_cents: quote.totalCents, provider: "manual" },
  });

  if (quote.storeCreditAppliedCents > 0) {
    // No trigger maintains balances — compute balance_after_cents here, in the
    // same call sequence as the profile decrement. The engine caps the applied
    // amount at the balance, so this never goes negative. The read-then-write
    // race is documented as acceptable at manual-payment volume.
    const balanceAfter = profile.store_credit_cents - quote.storeCreditAppliedCents;
    const { error: creditError } = await admin
      .from("profiles")
      .update({ store_credit_cents: balanceAfter })
      .eq("id", user.id);
    if (creditError) {
      console.error(
        `[checkout] store-credit decrement failed for order ${orderId}:`,
        creditError.message,
      );
    } else {
      await admin.from("loyalty_ledger").insert({
        user_id: user.id,
        order_id: orderId,
        kind: "spend",
        amount_cents: -quote.storeCreditAppliedCents,
        balance_after_cents: balanceAfter,
        note: "Store credit applied at checkout",
      });
    }
  }

  // (6) redirect() throws NEXT_REDIRECT — kept outside any try/catch.
  redirect(`/orders/${orderId}`);
}

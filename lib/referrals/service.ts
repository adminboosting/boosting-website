/**
 * Service-role data access for the referrals program. All referrals writes go
 * through `createAdminClient()` — the table grants authenticated SELECT only
 * (participants + admin, supabase/migrations/0004_commerce.sql), so RLS can
 * never do the writing for us.
 *
 * Every function here is BEST-EFFORT and never throws: attribution rides the
 * sign-up action and the reward rides the manual-payment confirmation, and
 * neither of those flows may fail because a referral hiccuped. Failures log
 * via console.error and return a degraded value instead.
 *
 * "server-only" on purpose: the fast suite cannot import this module. The pure
 * pieces live in lib/referrals/core.ts; the SQL semantics mirrored here are
 * pinned by tests/db/referrals.test.ts and tests/db/loyalty-cashback.test.ts.
 */
import "server-only";
import {
  generateReferralCode,
  normalizeReferralCode,
  REFERRAL_REWARD_CENTS,
} from "@/lib/referrals/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/env";

/** Unique-violation SQLSTATE — the only insert error worth one retry. */
const UNIQUE_VIOLATION = "23505";

/**
 * The signed-in user's shareable referral code: the code on their share row
 * (`referred_id IS NULL`), created on first ask. Null on the zero-backend
 * deploy or any failure — the referral card simply doesn't render.
 *
 * No unique index guards "one share row per user", so a concurrent first ask
 * can create two; harmless (both codes attribute to the same referrer) and the
 * created_at ordering keeps the displayed code stable afterwards.
 */
export async function getOrCreateShareCode(userId: string): Promise<string | null> {
  if (!isServiceRoleConfigured()) return null;
  try {
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("referrals")
      .select("code")
      .eq("referrer_id", userId)
      .is("referred_id", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const share = existing as { code: string } | null;
    if (share?.code) return share.code;

    // Two attempts: a fresh 32^8 code colliding twice is an outage, not luck.
    for (let attempt = 0; attempt < 2; attempt++) {
      const code = generateReferralCode();
      const { data: inserted, error } = await admin
        .from("referrals")
        .insert({ referrer_id: userId, code })
        .select("code")
        .maybeSingle();
      if (!error && inserted) return (inserted as { code: string }).code;
      if (error && error.code !== UNIQUE_VIOLATION) {
        console.error(`[referrals] share-code insert failed for ${userId}:`, error.message);
        return null;
      }
    }
    console.error(`[referrals] share-code collision retries exhausted for ${userId}`);
    return null;
  } catch (error) {
    console.error(`[referrals] getOrCreateShareCode failed for ${userId}:`, error);
    return null;
  }
}

/**
 * Record that `referredUserId` signed up through `code`. Called by the signUp
 * server action strictly AFTER a successful auth.signUp; silently no-ops when
 * the code is junk, unknown, an attribution row's code (only share rows are
 * shareable), self-referral, or the user already has an attribution row.
 *
 * Inserts a NEW row {referrer_id, referred_id, fresh code, status 'pending'} —
 * the share row is never claimed, which is how one code serves many signups
 * under the per-row UNIQUE constraint (plan risk #4).
 */
export async function attributeReferral(code: string, referredUserId: string): Promise<void> {
  if (!isServiceRoleConfigured()) return;
  try {
    const normalized = normalizeReferralCode(code);
    if (!normalized) return;

    const admin = createAdminClient();

    // Share rows only: an attribution row's code must not be re-shareable.
    const { data: shareData } = await admin
      .from("referrals")
      .select("referrer_id")
      .eq("code", normalized)
      .is("referred_id", null)
      .maybeSingle();
    const share = shareData as { referrer_id: string } | null;
    if (!share || share.referrer_id === referredUserId) return;

    // One attribution per referred user, ever — first code wins.
    const { data: prior } = await admin
      .from("referrals")
      .select("id")
      .eq("referred_id", referredUserId)
      .limit(1);
    if (prior && prior.length > 0) return;

    for (let attempt = 0; attempt < 2; attempt++) {
      const { error } = await admin.from("referrals").insert({
        referrer_id: share.referrer_id,
        referred_id: referredUserId,
        code: generateReferralCode(),
        status: "pending",
      });
      if (!error) return;
      if (error.code !== UNIQUE_VIOLATION) {
        console.error(
          `[referrals] attribution insert failed for ${referredUserId}:`,
          error.message,
        );
        return;
      }
    }
    console.error(`[referrals] attribution collision retries exhausted for ${referredUserId}`);
  } catch (error) {
    console.error(`[referrals] attributeReferral failed for ${referredUserId}:`, error);
  }
}

/**
 * Pay the referrer when the referred customer's FIRST payment is confirmed.
 * Called from recordManualPayment's confirmed branch, gated there on the
 * pre-bump `lifetime_spend_cents === 0` read (re-reading after the bump would
 * never fire — plan risk #5).
 *
 * pending → rewarded directly (no 'qualified' stop); the status predicate on
 * the UPDATE makes a concurrent double-confirm a no-op instead of a double
 * reward. Credits REFERRAL_REWARD_CENTS to the referrer's store credit with a
 * loyalty_ledger 'earn' row (order_id null — the referred customer's order is
 * not the referrer's to link to).
 */
export async function rewardReferralOnFirstPayment(
  referredUserId: string,
  orderId: string,
): Promise<void> {
  if (!isServiceRoleConfigured()) return;
  try {
    const admin = createAdminClient();

    const { data: pendingData } = await admin
      .from("referrals")
      .select("id, referrer_id")
      .eq("referred_id", referredUserId)
      .eq("status", "pending")
      .limit(1);
    const pending = ((pendingData ?? []) as { id: string; referrer_id: string }[])[0];
    if (!pending) return;

    const { data: flipped, error: flipError } = await admin
      .from("referrals")
      .update({ status: "rewarded", reward_cents: REFERRAL_REWARD_CENTS })
      .eq("id", pending.id)
      .eq("status", "pending")
      .select("id");
    if (flipError || !flipped || flipped.length === 0) {
      console.error(
        `[referrals] reward flip failed for order ${orderId}:`,
        flipError?.message ?? "no row matched status 'pending'",
      );
      return;
    }

    // Same read-then-write pattern (and the same accepted race) as the
    // cashback credit in recordManualPayment — no trigger maintains balances.
    const { data: profileData } = await admin
      .from("profiles")
      .select("store_credit_cents")
      .eq("id", pending.referrer_id)
      .maybeSingle();
    const profile = profileData as { store_credit_cents: number } | null;
    if (!profile) {
      console.error(`[referrals] no referrer profile for referral ${pending.id} — credit skipped`);
      return;
    }
    const balanceAfter = profile.store_credit_cents + REFERRAL_REWARD_CENTS;

    const { error: creditError } = await admin
      .from("profiles")
      .update({ store_credit_cents: balanceAfter })
      .eq("id", pending.referrer_id);
    if (creditError) {
      console.error(
        `[referrals] referrer credit failed for referral ${pending.id}:`,
        creditError.message,
      );
      return;
    }

    const { error: ledgerError } = await admin.from("loyalty_ledger").insert({
      user_id: pending.referrer_id,
      kind: "earn",
      amount_cents: REFERRAL_REWARD_CENTS,
      balance_after_cents: balanceAfter,
      note: "Referral reward",
    });
    if (ledgerError) {
      console.error(
        `[referrals] ledger insert failed for referral ${pending.id}:`,
        ledgerError.message,
      );
    }
  } catch (error) {
    console.error(`[referrals] rewardReferralOnFirstPayment failed for order ${orderId}:`, error);
  }
}

/** How many of the user's referrals have been rewarded; 0 on any failure. */
export async function countRewardedReferrals(userId: string): Promise<number> {
  if (!isServiceRoleConfigured()) return 0;
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", userId)
      .eq("status", "rewarded");
    if (error) {
      console.error(`[referrals] rewarded count failed for ${userId}:`, error.message);
      return 0;
    }
    return count ?? 0;
  } catch (error) {
    console.error(`[referrals] countRewardedReferrals failed for ${userId}:`, error);
    return 0;
  }
}

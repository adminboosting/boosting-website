import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { getLoyaltyTierForSpend } from "@/lib/catalog/data";
import { applyBp } from "@/lib/money";
import { REFERRAL_REWARD_CENTS } from "@/lib/referrals/core";
import { type Actor, asActor, bootstrapDb, seedUser } from "./helpers/bootstrap";

/**
 * The manual-payment confirmed branch against real Postgres (PGlite):
 * confirmPaymentSql below mirrors the exact service-role SQL sequence of
 * recordManualPayment (app/(admin)/admin/orders/actions.ts) — payment walk,
 * order → paid, lifetime-spend bump, tier cashback into store credit with an
 * 'earn' ledger row — plus the Phase 4 referral hook: reward the referrer on
 * the customer's FIRST confirmed payment, gated on the PRE-bump
 * lifetime_spend_cents === 0 read (after the bump it can never fire again).
 *
 * The referral reward mirror (rewardReferralSql) matches
 * lib/referrals/service.ts#rewardReferralOnFirstPayment: pending→rewarded with
 * a status predicate (double-confirm = no-op), +$5 store credit to the
 * referrer, 'Referral reward' ledger row with order_id NULL.
 *
 * Money is integer cents throughout; bigint columns are ::int-cast in reads
 * because test values are small.
 */
const ALICE = "aaaaaaaa-0000-0000-0000-000000000001"; // referrer
const BOB = "bbbbbbbb-0000-0000-0000-000000000002"; // referred customer who pays
const CARA = "cccccccc-0000-0000-0000-000000000003"; // stranger (RLS foil)
const ADMIN = "dddddddd-0000-0000-0000-000000000004";

const ORDER_1 = "0a0a0a0a-0000-0000-0000-0000000000a1"; // Bob's first order, 5000¢
const ORDER_2 = "0b0b0b0b-0000-0000-0000-0000000000b2"; // Bob's second order, 4000¢
const PAYMENT_1 = "1a1a1a1a-0000-0000-0000-0000000000a1";
const PAYMENT_2 = "1b1b1b1b-0000-0000-0000-0000000000b2";

const ORDER_1_CENTS = 5000;
const ORDER_2_CENTS = 4000;

let db: PGlite;

async function count(actor: Actor, sql: string, params: unknown[] = []): Promise<number> {
  return asActor(db, actor, async () => {
    const r = await db.query<{ n: string }>(`select count(*)::text as n from (${sql}) q`, params);
    return Number(r.rows[0]!.n);
  });
}

interface Balances {
  lifetime_spend_cents: number;
  store_credit_cents: number;
}

async function readBalances(userId: string): Promise<Balances> {
  return asActor(db, { kind: "service" }, async () => {
    const r = await db.query<Balances>(
      `select lifetime_spend_cents::int as lifetime_spend_cents,
              store_credit_cents::int as store_credit_cents
       from public.profiles where id = $1`,
      [userId],
    );
    return r.rows[0]!;
  });
}

/**
 * Mirror of rewardReferralOnFirstPayment. Runs inside the caller's service
 * transaction (no asActor of its own). Returns true when a reward was paid.
 */
async function rewardReferralSql(referredUserId: string): Promise<boolean> {
  const pending = await db.query<{ id: string; referrer_id: string }>(
    `select id, referrer_id from public.referrals
     where referred_id = $1 and status = 'pending' limit 1`,
    [referredUserId],
  );
  const row = pending.rows[0];
  if (!row) return false;

  // Status predicate: a concurrent double-confirm flips zero rows.
  const flipped = await db.query(
    `update public.referrals set status = 'rewarded', reward_cents = $2
     where id = $1 and status = 'pending' returning id`,
    [row.id, REFERRAL_REWARD_CENTS],
  );
  if (flipped.rows.length === 0) return false;

  const prof = await db.query<{ store_credit_cents: number }>(
    `select store_credit_cents::int as store_credit_cents from public.profiles where id = $1`,
    [row.referrer_id],
  );
  const balanceAfter = prof.rows[0]!.store_credit_cents + REFERRAL_REWARD_CENTS;
  await db.query(`update public.profiles set store_credit_cents = $2 where id = $1`, [
    row.referrer_id,
    balanceAfter,
  ]);
  await db.query(
    `insert into public.loyalty_ledger (user_id, order_id, kind, amount_cents, balance_after_cents, note)
     values ($1, null, 'earn', $2, $3, 'Referral reward')`,
    [row.referrer_id, REFERRAL_REWARD_CENTS, balanceAfter],
  );
  return true;
}

/** Mirror of recordManualPayment's confirmed branch, one service transaction. */
async function confirmPaymentSql(paymentId: string): Promise<void> {
  await asActor(db, { kind: "service" }, async () => {
    const p = await db.query<{ id: string; order_id: string; amount_cents: number }>(
      `select id, order_id, amount_cents from public.payments where id = $1`,
      [paymentId],
    );
    const payment = p.rows[0]!;
    await db.query(`update public.payments set status = 'confirmed' where id = $1`, [payment.id]);

    const o = await db.query<{
      id: string;
      user_id: string;
      subtotal_cents: number;
      discount_cents: number;
    }>(`select id, user_id, subtotal_cents, discount_cents from public.orders where id = $1`, [
      payment.order_id,
    ]);
    const order = o.rows[0]!;
    await db.query(`update public.orders set status = 'paid' where id = $1`, [order.id]);

    // Pre-bump balances read — the tier AND the referral gate both key off it.
    const balances = (
      await db.query<Balances>(
        `select lifetime_spend_cents::int as lifetime_spend_cents,
              store_credit_cents::int as store_credit_cents
       from public.profiles where id = $1`,
        [order.user_id],
      )
    ).rows[0]!;

    const tier = getLoyaltyTierForSpend(balances.lifetime_spend_cents);
    const preCreditTotal = Math.max(0, order.subtotal_cents - order.discount_cents);
    const cashbackCents = applyBp(preCreditTotal, tier.cashbackBp);
    const balanceAfter = balances.store_credit_cents + cashbackCents;

    await db.query(
      `update public.profiles set lifetime_spend_cents = $2, store_credit_cents = $3 where id = $1`,
      [order.user_id, balances.lifetime_spend_cents + payment.amount_cents, balanceAfter],
    );
    if (cashbackCents > 0) {
      await db.query(
        `insert into public.loyalty_ledger (user_id, order_id, kind, amount_cents, balance_after_cents, note)
         values ($1, $2, 'earn', $3, $4, $5)`,
        [
          order.user_id,
          order.id,
          cashbackCents,
          balanceAfter,
          `Cashback (${tier.name}) — manual payment confirmed`,
        ],
      );
    }

    // The Phase 4 hook, gated on the PRE-bump read.
    if (balances.lifetime_spend_cents === 0) {
      await rewardReferralSql(order.user_id);
    }
  });
}

beforeAll(async () => {
  db = await bootstrapDb();

  await seedUser(db, { id: ALICE, role: "customer" });
  await seedUser(db, { id: BOB, role: "customer" });
  await seedUser(db, { id: CARA, role: "customer" });
  await seedUser(db, { id: ADMIN, role: "admin" });

  // Minimal catalog row so the orders FK is satisfied.
  await db.query(
    `insert into public.games (slug, name, short_name, divisions_per_tier) values ($1,$2,$3,$4)`,
    ["valorant", "Valorant", "VAL", 3],
  );
  for (const [orderId, cents] of [
    [ORDER_1, ORDER_1_CENTS],
    [ORDER_2, ORDER_2_CENTS],
  ] as const) {
    await db.query(
      `insert into public.orders
         (id, user_id, game_slug, service_type, mode, region_code, config, subtotal_cents, total_cents)
       values ($1,$2,'valorant','rank_boost','piloted','na','{}'::jsonb,$3,$3)`,
      [orderId, BOB, cents],
    );
  }
  await asActor(db, { kind: "service" }, async () => {
    for (const [paymentId, orderId, cents] of [
      [PAYMENT_1, ORDER_1, ORDER_1_CENTS],
      [PAYMENT_2, ORDER_2, ORDER_2_CENTS],
    ] as const) {
      await db.query(
        `insert into public.payments (id, order_id, provider, amount_cents, status)
         values ($1,$2,'manual',$3,'created')`,
        [paymentId, orderId, cents],
      );
    }
    // Alice referred Bob: share row + pending attribution row (the model
    // pinned by tests/db/referrals.test.ts).
    await db.query(`insert into public.referrals (referrer_id, code) values ($1,'ALICE4US')`, [
      ALICE,
    ]);
    await db.query(
      `insert into public.referrals (referrer_id, referred_id, code, status)
       values ($1,$2,'BOBFRESH','pending')`,
      [ALICE, BOB],
    );
  });
});

afterAll(async () => {
  await db?.close();
});

// Bronze tier (0¢ lifetime spend): cashbackBp 50 → 0.5%.
const CASHBACK_1 = applyBp(ORDER_1_CENTS, getLoyaltyTierForSpend(0).cashbackBp);
const CASHBACK_2 = applyBp(ORDER_2_CENTS, getLoyaltyTierForSpend(ORDER_1_CENTS).cashbackBp);

describe("first confirmed payment", () => {
  it("bumps lifetime spend and credits Bronze cashback with a correct ledger row", async () => {
    await confirmPaymentSql(PAYMENT_1);

    const bob = await readBalances(BOB);
    expect(bob.lifetime_spend_cents).toBe(ORDER_1_CENTS);
    expect(bob.store_credit_cents).toBe(CASHBACK_1);

    const ledger = await asActor(db, { kind: "service" }, async () => {
      const r = await db.query<{
        kind: string;
        amount_cents: number;
        balance_after_cents: number;
        order_id: string | null;
      }>(
        `select kind::text as kind, amount_cents::int as amount_cents,
                balance_after_cents::int as balance_after_cents, order_id
         from public.loyalty_ledger where user_id = $1`,
        [BOB],
      );
      return r.rows;
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      kind: "earn",
      amount_cents: CASHBACK_1,
      balance_after_cents: CASHBACK_1,
      order_id: ORDER_1,
    });
  });

  it("rewards the referrer: row → rewarded/500, +$5 credit, 'Referral reward' ledger row", async () => {
    const referral = await asActor(db, { kind: "service" }, async () => {
      const r = await db.query<{ status: string; reward_cents: number }>(
        `select status::text as status, reward_cents from public.referrals
         where referred_id = $1`,
        [BOB],
      );
      return r.rows[0]!;
    });
    expect(referral).toMatchObject({ status: "rewarded", reward_cents: REFERRAL_REWARD_CENTS });

    const alice = await readBalances(ALICE);
    expect(alice.store_credit_cents).toBe(REFERRAL_REWARD_CENTS);
    expect(alice.lifetime_spend_cents).toBe(0); // reward is credit, never spend

    const ledger = await asActor(db, { kind: "service" }, async () => {
      const r = await db.query<{
        amount_cents: number;
        balance_after_cents: number;
        note: string;
        order_id: string | null;
      }>(
        `select amount_cents::int as amount_cents, balance_after_cents::int as balance_after_cents,
                note, order_id
         from public.loyalty_ledger where user_id = $1`,
        [ALICE],
      );
      return r.rows;
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      amount_cents: REFERRAL_REWARD_CENTS,
      balance_after_cents: REFERRAL_REWARD_CENTS,
      note: "Referral reward",
      order_id: null,
    });
  });
});

describe("second confirmed payment", () => {
  it("credits cashback again but does NOT re-reward the referral (pre-bump gate)", async () => {
    await confirmPaymentSql(PAYMENT_2);

    const bob = await readBalances(BOB);
    expect(bob.lifetime_spend_cents).toBe(ORDER_1_CENTS + ORDER_2_CENTS);
    expect(bob.store_credit_cents).toBe(CASHBACK_1 + CASHBACK_2);

    const alice = await readBalances(ALICE);
    expect(alice.store_credit_cents).toBe(REFERRAL_REWARD_CENTS); // unchanged
    expect(
      await count(
        { kind: "service" },
        "select id from public.loyalty_ledger where note = 'Referral reward'",
      ),
    ).toBe(1);
  });

  it("even a direct re-run of the reward is a no-op (no pending row left)", async () => {
    const rewarded = await asActor(db, { kind: "service" }, () => rewardReferralSql(BOB));
    expect(rewarded).toBe(false);
    expect((await readBalances(ALICE)).store_credit_cents).toBe(REFERRAL_REWARD_CENTS);
  });
});

describe("loyalty_ledger RLS (loyalty_ledger_select_own)", () => {
  it("each user reads only their own rows; a stranger reads none; an admin reads all", async () => {
    const bobRows = 2; // two cashback earns
    const aliceRows = 1; // one referral reward
    expect(await count({ kind: "user", userId: BOB }, "select id from public.loyalty_ledger")).toBe(
      bobRows,
    );
    expect(
      await count({ kind: "user", userId: ALICE }, "select id from public.loyalty_ledger"),
    ).toBe(aliceRows);
    expect(
      await count({ kind: "user", userId: CARA }, "select id from public.loyalty_ledger"),
    ).toBe(0);
    expect(
      await count({ kind: "user", userId: ADMIN }, "select id from public.loyalty_ledger"),
    ).toBe(bobRows + aliceRows);
  });

  it("anon cannot read the ledger at all (no grant)", async () => {
    await expect(count({ kind: "anon" }, "select id from public.loyalty_ledger")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("an authenticated user cannot INSERT ledger rows (no grant)", async () => {
    await expect(
      asActor(db, { kind: "user", userId: BOB }, async () => {
        await db.query(
          `insert into public.loyalty_ledger (user_id, kind, amount_cents, balance_after_cents)
           values ($1, 'earn', 99999, 99999)`,
          [BOB],
        );
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

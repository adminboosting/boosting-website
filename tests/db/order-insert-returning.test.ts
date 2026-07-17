import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asActor, bootstrapDb, seedUser } from "./helpers/bootstrap";

/**
 * Regression for migration 0008 (checkout was fully broken in production).
 *
 * `createOrder` inserts with `.select("id").single()`, so PostgreSQL evaluates
 * the SELECT policy (`orders_select_participants`) on the RETURNING row. That
 * policy delegates to `can_access_order()`, which is STABLE SECURITY DEFINER and
 * re-queries `public.orders`. A STABLE function sees the statement-start
 * snapshot, which does NOT contain the row being inserted by that very
 * statement — so for a brand-new order it returned false and RLS denied the
 * readback with 42501 ("new row violates row-level security policy"), even
 * though the INSERT's own WITH CHECK (user_id = auth.uid()) passed.
 *
 * 0008 short-circuits the owner check on the candidate row's own column
 * (`user_id = auth.uid() or can_access_order(id)`), so an owner can always read
 * back their own row. This test fails on the pre-0008 policy and passes after.
 *
 * Note: the sibling order-flow test inserts WITHOUT `returning`, which is why it
 * never exercised this path — the RETURNING clause is essential to the repro.
 */
const OWNER = "eeeeeeee-0000-0000-0000-000000000001";
const NEW_ORDER = "0e0e0e0e-0000-0000-0000-0000000000e1";

let db: PGlite;

beforeAll(async () => {
  db = await bootstrapDb();
  await seedUser(db, { id: OWNER, role: "customer" });
  await db.query(
    `insert into public.games (slug, name, short_name, divisions_per_tier) values ($1,$2,$3,$4)`,
    ["valorant", "Valorant", "VAL", 3],
  );
});

afterAll(async () => {
  await db?.close();
});

describe("orders INSERT ... RETURNING under RLS (migration 0008)", () => {
  it("an owner can read back their own new order id (the checkout path)", async () => {
    await asActor(db, { kind: "user", userId: OWNER }, async () => {
      const r = await db.query<{ id: string }>(
        `insert into public.orders
           (id, user_id, game_slug, service_type, mode, region_code, config, subtotal_cents, total_cents)
         values ($1,$2,'valorant','rank_boost','piloted','na','{}'::jsonb, 5000, 5000)
         returning id`,
        [NEW_ORDER, OWNER],
      );
      expect(r.rows[0]?.id).toBe(NEW_ORDER);
    });
  });

  it("still forbids inserting an order for another user", async () => {
    await asActor(db, { kind: "user", userId: OWNER }, async () => {
      await expect(
        db.query(
          `insert into public.orders
             (id, user_id, game_slug, service_type, mode, region_code, config, subtotal_cents, total_cents)
           values ($1,$2,'valorant','rank_boost','piloted','na','{}'::jsonb, 5000, 5000)
           returning id`,
          ["0e0e0e0e-0000-0000-0000-0000000000e2", "ffffffff-0000-0000-0000-000000000009"],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });
});

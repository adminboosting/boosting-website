import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { type Actor, asActor, bootstrapDb, seedUser } from "./helpers/bootstrap";

/**
 * Booster assignment lifecycle on real Postgres (PGlite), regression-pinning
 * the Phase-3 grant trap: order_assignments carries an admin FOR ALL policy
 * (order_assignments_write_admin) but a SELECT-only authenticated grant — so
 * even an admin is grant-blocked from PostgREST writes, and ALL assignment
 * writes go through the service role (assignBooster/unassignBooster in
 * app/(admin)/admin/orders/actions.ts). Do not "fix" a red test here by
 * widening grants. Also proves the one-active partial unique index and that
 * can_access_order() flips with is_active — the mid-session revocation the
 * booster surface must tolerate.
 *
 * The `it` blocks run in file order and share one database: this is one
 * lifecycle told start to finish (assign → walk → release → re-assign).
 */
const ALICE = "aaaaaaaa-0000-0000-0000-000000000001";
const BOOSTER = "cccccccc-0000-0000-0000-000000000003";
const BOOSTER2 = "eeeeeeee-0000-0000-0000-000000000005";
const ADMIN = "dddddddd-0000-0000-0000-000000000004";
const ORDER_A = "0a0a0a0a-0000-0000-0000-0000000000a1";

let db: PGlite;

async function count(actor: Actor, sql: string, params: unknown[] = []): Promise<number> {
  return asActor(db, actor, async () => {
    const r = await db.query<{ n: string }>(`select count(*)::text as n from (${sql}) q`, params);
    return Number(r.rows[0]!.n);
  });
}

/** can_access_order() as the given user — the single participant predicate. */
async function canAccess(userId: string, orderId: string): Promise<boolean> {
  return asActor(db, { kind: "user", userId }, async () => {
    const r = await db.query<{ ok: boolean }>(`select public.can_access_order($1) as ok`, [
      orderId,
    ]);
    return r.rows[0]!.ok;
  });
}

beforeAll(async () => {
  db = await bootstrapDb();

  await seedUser(db, { id: ALICE, role: "customer" });
  await seedUser(db, { id: BOOSTER, role: "booster" });
  await seedUser(db, { id: BOOSTER2, role: "booster" });
  await seedUser(db, { id: ADMIN, role: "admin" });

  // Minimal catalog row so the orders FK is satisfied.
  await db.query(
    `insert into public.games (slug, name, short_name, divisions_per_tier) values ($1,$2,$3,$4)`,
    ["valorant", "Valorant", "VAL", 3],
  );
  // A paid order — the state assignBooster walks to 'assigned'.
  await db.query(
    `insert into public.orders
       (id, user_id, game_slug, service_type, mode, region_code, config, status, subtotal_cents, total_cents)
     values ($1,$2,'valorant','rank_boost','piloted','na','{}'::jsonb,'paid', 5000, 5000)`,
    [ORDER_A, ALICE],
  );
  // A customer message, so message visibility can prove the access flip.
  await db.query(
    `insert into public.order_messages (order_id, sender_id, body) values ($1,$2,'hello')`,
    [ORDER_A, ALICE],
  );
});

afterAll(async () => {
  await db?.close();
});

describe("assignment lifecycle", () => {
  it("before assignment, the booster has no access to the order", async () => {
    expect(await canAccess(BOOSTER, ORDER_A)).toBe(false);
    expect(await count({ kind: "user", userId: BOOSTER }, "select id from public.orders")).toBe(0);
    expect(
      await count({ kind: "user", userId: BOOSTER }, "select id from public.order_messages"),
    ).toBe(0);
  });

  it("an authenticated admin cannot write order_assignments — the SELECT-only grant trap", async () => {
    // The order_assignments_write_admin policy would allow this, but the grant
    // stops PostgREST first. This is the deliberate asymmetry the service-role
    // actions exist for.
    await expect(
      asActor(db, { kind: "user", userId: ADMIN }, async () => {
        await db.query(
          `insert into public.order_assignments (order_id, booster_id) values ($1,$2)`,
          [ORDER_A, BOOSTER],
        );
      }),
    ).rejects.toThrow(/permission denied/);

    await expect(
      asActor(db, { kind: "user", userId: ADMIN }, async () => {
        await db.query(`update public.order_assignments set is_active = false`);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("the service role assigns, and can_access_order flips on for the booster", async () => {
    await asActor(db, { kind: "service" }, async () => {
      await db.query(`insert into public.order_assignments (order_id, booster_id) values ($1,$2)`, [
        ORDER_A,
        BOOSTER,
      ]);
    });

    expect(await canAccess(BOOSTER, ORDER_A)).toBe(true);
    expect(await count({ kind: "user", userId: BOOSTER }, "select id from public.orders")).toBe(1);
    expect(
      await count({ kind: "user", userId: BOOSTER }, "select id from public.order_messages"),
    ).toBe(1);
  });

  it("a second active assignment is rejected by the partial unique index", async () => {
    await expect(
      asActor(db, { kind: "service" }, async () => {
        await db.query(
          `insert into public.order_assignments (order_id, booster_id) values ($1,$2)`,
          [ORDER_A, BOOSTER2],
        );
      }),
    ).rejects.toThrow(/order_assignments_one_active/);
  });

  it("paid → assigned is a seeded transition, walks with a status predicate, and lands in order_progress", async () => {
    // The app-side map (lib/orders/transitions.ts) mirrors this seeded table;
    // pin that the pair the action walks actually exists in the data.
    expect(
      await count(
        { kind: "service" },
        `select 1 from public.order_status_transitions
          where from_status = 'paid' and to_status = 'assigned'`,
      ),
    ).toBe(1);

    await asActor(db, { kind: "service" }, async () => {
      const moved = await db.query<{ id: string }>(
        `update public.orders set status = 'assigned'
          where id = $1 and status = 'paid' returning id`,
        [ORDER_A],
      );
      expect(moved.rows).toHaveLength(1);

      await db.query(
        `insert into public.order_progress (order_id, status_from, status_to, note, created_by)
         values ($1, 'paid', 'assigned', 'Booster assigned', $2)`,
        [ORDER_A, ADMIN],
      );
    });

    // The customer (participant) sees the timeline row.
    expect(
      await count({ kind: "user", userId: ALICE }, "select id from public.order_progress"),
    ).toBe(1);
  });

  it("a concurrent double-walk is a rejected no-op (status predicate matches zero rows)", async () => {
    const moved = await asActor(db, { kind: "service" }, async () => {
      const r = await db.query<{ id: string }>(
        `update public.orders set status = 'assigned'
          where id = $1 and status = 'paid' returning id`,
        [ORDER_A],
      );
      return r.rows.length;
    });
    expect(moved).toBe(0);
  });

  it("unassign flips access off instantly, but the booster keeps their own assignment rows", async () => {
    await asActor(db, { kind: "service" }, async () => {
      const released = await db.query<{ id: string }>(
        `update public.order_assignments
            set is_active = false, unassigned_at = now()
          where order_id = $1 and is_active returning id`,
        [ORDER_A],
      );
      expect(released.rows).toHaveLength(1);
    });

    // Mid-session revocation: order, messages, and progress all vanish…
    expect(await canAccess(BOOSTER, ORDER_A)).toBe(false);
    expect(await count({ kind: "user", userId: BOOSTER }, "select id from public.orders")).toBe(0);
    expect(
      await count({ kind: "user", userId: BOOSTER }, "select id from public.order_messages"),
    ).toBe(0);
    expect(
      await count({ kind: "user", userId: BOOSTER }, "select id from public.order_progress"),
    ).toBe(0);
    // …but order_assignments_select keeps booster_id = auth.uid() rows, so the
    // booster desk can still render a "recently completed" list.
    expect(
      await count({ kind: "user", userId: BOOSTER }, "select id from public.order_assignments"),
    ).toBe(1);
  });

  it("re-assignment after release is allowed — the index only guards actives", async () => {
    await asActor(db, { kind: "service" }, async () => {
      await db.query(`insert into public.order_assignments (order_id, booster_id) values ($1,$2)`, [
        ORDER_A,
        BOOSTER2,
      ]);
    });

    expect(await canAccess(BOOSTER2, ORDER_A)).toBe(true);
    // The released booster stays revoked.
    expect(await canAccess(BOOSTER, ORDER_A)).toBe(false);
  });
});

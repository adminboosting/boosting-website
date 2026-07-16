import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { ORDER_STATUS_TRANSITIONS } from "@/lib/orders/transitions";
import { type Actor, asActor, bootstrapDb, seedUser } from "./helpers/bootstrap";

/**
 * Phase 2 order flow on real Postgres (PGlite): a customer can create their own
 * order through RLS (orders_insert_own) but never one for someone else;
 * visibility follows can_access_order(); progress rows are staff-only; and the
 * app-side transition map (lib/orders/transitions.ts) is cross-checked against
 * the seeded order_status_transitions table so the two can never drift.
 */
const ALICE = "aaaaaaaa-0000-0000-0000-000000000001";
const BOB = "bbbbbbbb-0000-0000-0000-000000000002";
const BOOSTER = "cccccccc-0000-0000-0000-000000000003";
const ADMIN = "dddddddd-0000-0000-0000-000000000004";
const ORDER_A = "0a0a0a0a-0000-0000-0000-0000000000a1";

let db: PGlite;

async function count(actor: Actor, sql: string, params: unknown[] = []): Promise<number> {
  return asActor(db, actor, async () => {
    const r = await db.query<{ n: string }>(`select count(*)::text as n from (${sql}) q`, params);
    return Number(r.rows[0]!.n);
  });
}

beforeAll(async () => {
  db = await bootstrapDb();

  await seedUser(db, { id: ALICE, role: "customer" });
  await seedUser(db, { id: BOB, role: "customer" });
  await seedUser(db, { id: BOOSTER, role: "booster" });
  await seedUser(db, { id: ADMIN, role: "admin" });

  // Minimal catalog row so the orders FK is satisfied.
  await db.query(
    `insert into public.games (slug, name, short_name, divisions_per_tier) values ($1,$2,$3,$4)`,
    ["valorant", "Valorant", "VAL", 3],
  );
});

afterAll(async () => {
  await db?.close();
});

describe("order creation through RLS", () => {
  it("a customer inserts an order for themselves (orders_insert_own)", async () => {
    await asActor(db, { kind: "user", userId: ALICE }, async () => {
      await db.query(
        `insert into public.orders
           (id, user_id, game_slug, service_type, mode, region_code, config, subtotal_cents, total_cents)
         values ($1,$2,'valorant','rank_boost','piloted','na','{}'::jsonb, 5000, 5000)`,
        [ORDER_A, ALICE],
      );
    });
    expect(await count({ kind: "user", userId: ALICE }, "select id from public.orders")).toBe(1);
  });

  it("a customer cannot insert an order owned by someone else", async () => {
    await expect(
      asActor(db, { kind: "user", userId: ALICE }, async () => {
        await db.query(
          `insert into public.orders
             (user_id, game_slug, service_type, mode, region_code, config, subtotal_cents, total_cents)
           values ($1,'valorant','rank_boost','piloted','na','{}'::jsonb, 5000, 5000)`,
          [BOB],
        );
      }),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("order visibility (can_access_order)", () => {
  it("the owner sees the order; a stranger sees nothing; an admin sees it", async () => {
    expect(await count({ kind: "user", userId: ALICE }, "select id from public.orders")).toBe(1);
    expect(await count({ kind: "user", userId: BOB }, "select id from public.orders")).toBe(0);
    expect(await count({ kind: "user", userId: ADMIN }, "select id from public.orders")).toBe(1);
  });

  it("a booster gains visibility only once the service role assigns them", async () => {
    expect(await count({ kind: "user", userId: BOOSTER }, "select id from public.orders")).toBe(0);

    await asActor(db, { kind: "service" }, async () => {
      await db.query(
        `insert into public.order_assignments (order_id, booster_id) values ($1,$2)`,
        [ORDER_A, BOOSTER],
      );
    });

    expect(
      await count(
        { kind: "user", userId: BOOSTER },
        `select id from public.orders where id = '${ORDER_A}'`,
      ),
    ).toBe(1);
  });
});

describe("order progress is staff-only", () => {
  it("the customer cannot insert progress rows on their own order", async () => {
    await expect(
      asActor(db, { kind: "user", userId: ALICE }, async () => {
        await db.query(
          `insert into public.order_progress (order_id, status_from, status_to, created_by)
           values ($1,'pending_payment','paid',$2)`,
          [ORDER_A, ALICE],
        );
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it("an admin and the actively assigned booster can insert progress rows", async () => {
    await asActor(db, { kind: "user", userId: ADMIN }, async () => {
      await db.query(
        `insert into public.order_progress (order_id, status_from, status_to, created_by)
         values ($1,'pending_payment','paid',$2)`,
        [ORDER_A, ADMIN],
      );
    });
    await asActor(db, { kind: "user", userId: BOOSTER }, async () => {
      await db.query(
        `insert into public.order_progress (order_id, status_from, status_to, created_by)
         values ($1,'paid','assigned',$2)`,
        [ORDER_A, BOOSTER],
      );
    });
    expect(
      await count({ kind: "user", userId: ALICE }, "select id from public.order_progress"),
    ).toBe(2);
  });
});

describe("transition-map drift guard", () => {
  it("lib/orders/transitions.ts mirrors the seeded order_status_transitions exactly", async () => {
    // The DB table is data, not a constraint — the app constant is the only
    // enforcement, so pair-for-pair equality is what keeps them honest.
    const expected = Object.entries(ORDER_STATUS_TRANSITIONS)
      .flatMap(([from, tos]) => tos.map((to) => `${from}->${to}`))
      .sort();

    const r = await db.query<{ from_status: string; to_status: string }>(
      `select from_status::text, to_status::text from public.order_status_transitions`,
    );
    const seeded = r.rows.map((row) => `${row.from_status}->${row.to_status}`).sort();

    expect(seeded).toEqual(expected);
  });

  it("the transition map is readable by anon (public data)", async () => {
    expect(
      await count({ kind: "anon" }, "select from_status from public.order_status_transitions"),
    ).toBeGreaterThan(0);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { type Actor, asActor, bootstrapDb, seedUser } from "./helpers/bootstrap";

/**
 * Gate B: proves RLS isolation on real Postgres (PGlite) with the Supabase-style
 * role + JWT-claims pattern. A customer cannot see another customer's order or
 * any credential row; only the service role can read credentials; only an
 * assigned booster (or admin) can see an assigned order.
 */
const ALICE = "aaaaaaaa-0000-0000-0000-000000000001";
const BOB = "bbbbbbbb-0000-0000-0000-000000000002";
const BOOSTER = "cccccccc-0000-0000-0000-000000000003";
const ADMIN = "dddddddd-0000-0000-0000-000000000004";
const ORDER_A = "0a0a0a0a-0000-0000-0000-0000000000a1";
const ORDER_B = "0b0b0b0b-0000-0000-0000-0000000000b2";

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

  for (const [id, user] of [
    [ORDER_A, ALICE],
    [ORDER_B, BOB],
  ] as const) {
    await db.query(
      `insert into public.orders
         (id, user_id, game_slug, service_type, mode, region_code, config, subtotal_cents, total_cents)
       values ($1,$2,'valorant','rank_boost','piloted','na','{}'::jsonb, 5000, 5000)`,
      [id, user],
    );
  }

  // Booster is assigned to Alice's order only.
  await db.query(`insert into public.order_assignments (order_id, booster_id) values ($1,$2)`, [
    ORDER_A,
    BOOSTER,
  ]);

  // A credential row + a message on Alice's order.
  await db.query(
    `insert into public.order_credentials (order_id, ciphertext, iv, auth_tag)
     values ($1,'cipher','iv','tag')`,
    [ORDER_A],
  );
  await db.query(
    `insert into public.order_messages (order_id, sender_id, body) values ($1,$2,'hello')`,
    [ORDER_A, ALICE],
  );
});

afterAll(async () => {
  await db?.close();
});

describe("orders isolation", () => {
  it("a customer sees only their own order", async () => {
    expect(await count({ kind: "user", userId: ALICE }, "select id from public.orders")).toBe(1);
    expect(
      await count(
        { kind: "user", userId: ALICE },
        `select id from public.orders where id = '${ORDER_B}'`,
      ),
    ).toBe(0);
    expect(await count({ kind: "user", userId: BOB }, "select id from public.orders")).toBe(1);
  });

  it("an assigned booster sees the assigned order, not others", async () => {
    expect(await count({ kind: "user", userId: BOOSTER }, "select id from public.orders")).toBe(1);
    expect(
      await count(
        { kind: "user", userId: BOOSTER },
        `select id from public.orders where id = '${ORDER_A}'`,
      ),
    ).toBe(1);
    expect(
      await count(
        { kind: "user", userId: BOOSTER },
        `select id from public.orders where id = '${ORDER_B}'`,
      ),
    ).toBe(0);
  });

  it("an admin sees all orders", async () => {
    expect(await count({ kind: "user", userId: ADMIN }, "select id from public.orders")).toBe(2);
  });

  it("anon cannot read orders at all (no grant)", async () => {
    await expect(count({ kind: "anon" }, "select id from public.orders")).rejects.toThrow();
  });
});

describe("credential vault deny-all", () => {
  it("no authenticated actor — not even admin — can read credentials via PostgREST", async () => {
    // The grant itself is revoked, so PostgREST denies access outright (stronger
    // than an empty result). Every non-service actor must be rejected.
    for (const userId of [ALICE, BOB, BOOSTER, ADMIN]) {
      await expect(
        count({ kind: "user", userId }, "select id from public.order_credentials"),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("only the service role can read credentials", async () => {
    expect(await count({ kind: "service" }, "select id from public.order_credentials")).toBe(1);
  });
});

describe("order messages isolation", () => {
  it("only order participants read the order's messages", async () => {
    expect(
      await count(
        { kind: "user", userId: ALICE },
        `select id from public.order_messages where order_id = '${ORDER_A}'`,
      ),
    ).toBe(1);
    expect(
      await count(
        { kind: "user", userId: BOOSTER },
        `select id from public.order_messages where order_id = '${ORDER_A}'`,
      ),
    ).toBe(1);
    expect(
      await count(
        { kind: "user", userId: BOB },
        `select id from public.order_messages where order_id = '${ORDER_A}'`,
      ),
    ).toBe(0);
  });
});

describe("profiles isolation + role-escalation guard", () => {
  it("a customer sees only their own profile; an admin sees all", async () => {
    expect(await count({ kind: "user", userId: ALICE }, "select id from public.profiles")).toBe(1);
    expect(await count({ kind: "user", userId: ADMIN }, "select id from public.profiles")).toBe(4);
  });

  it("a non-admin cannot escalate their own role", async () => {
    await expect(
      asActor(db, { kind: "user", userId: ALICE }, async () => {
        await db.query(`update public.profiles set role = 'admin' where id = $1`, [ALICE]);
      }),
    ).rejects.toThrow(/only admins may change a profile role/);
  });
});

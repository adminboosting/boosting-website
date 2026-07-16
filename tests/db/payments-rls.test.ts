import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { type Actor, asActor, bootstrapDb, seedUser } from "./helpers/bootstrap";

/**
 * Payments table posture on real Postgres (PGlite): authenticated users hold a
 * SELECT grant only — owners read payments on their own orders, admins read
 * all, and every write path (the manual created→pending→confirmed walk) is
 * service-role territory. Also pins the payments_set_updated_at trigger.
 */
const ALICE = "aaaaaaaa-0000-0000-0000-000000000001";
const BOB = "bbbbbbbb-0000-0000-0000-000000000002";
const ADMIN = "dddddddd-0000-0000-0000-000000000004";
const ORDER_A = "0a0a0a0a-0000-0000-0000-0000000000a1";
const PAYMENT_A = "1a1a1a1a-0000-0000-0000-0000000000a1";

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
  await seedUser(db, { id: ADMIN, role: "admin" });

  // Minimal catalog row so the orders FK is satisfied.
  await db.query(
    `insert into public.games (slug, name, short_name, divisions_per_tier) values ($1,$2,$3,$4)`,
    ["valorant", "Valorant", "VAL", 3],
  );
  await db.query(
    `insert into public.orders
       (id, user_id, game_slug, service_type, mode, region_code, config, subtotal_cents, total_cents)
     values ($1,$2,'valorant','rank_boost','piloted','na','{}'::jsonb, 5000, 5000)`,
    [ORDER_A, ALICE],
  );

  // The manual-flow payment row, written the way createOrder does it: through
  // the service role — authenticated has no insert grant.
  await asActor(db, { kind: "service" }, async () => {
    await db.query(
      `insert into public.payments (id, order_id, provider, amount_cents, status)
       values ($1,$2,'manual',5000,'created')`,
      [PAYMENT_A, ORDER_A],
    );
  });
});

afterAll(async () => {
  await db?.close();
});

describe("payments read isolation", () => {
  it("the order owner and an admin see the payment; a stranger sees nothing", async () => {
    expect(await count({ kind: "user", userId: ALICE }, "select id from public.payments")).toBe(1);
    expect(await count({ kind: "user", userId: BOB }, "select id from public.payments")).toBe(0);
    expect(await count({ kind: "user", userId: ADMIN }, "select id from public.payments")).toBe(1);
  });

  it("anon cannot read payments at all (no grant)", async () => {
    await expect(count({ kind: "anon" }, "select id from public.payments")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("payments are write-protected from authenticated users", () => {
  it("an authenticated owner cannot INSERT a payment (no grant)", async () => {
    await expect(
      asActor(db, { kind: "user", userId: ALICE }, async () => {
        await db.query(
          `insert into public.payments (order_id, provider, amount_cents, status)
           values ($1,'manual',1,'confirmed')`,
          [ORDER_A],
        );
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("an authenticated owner cannot UPDATE a payment (no grant)", async () => {
    await expect(
      asActor(db, { kind: "user", userId: ALICE }, async () => {
        await db.query(`update public.payments set status = 'confirmed' where id = $1`, [
          PAYMENT_A,
        ]);
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("service-role manual payment walk", () => {
  it("walks created→pending→confirmed and the updated_at trigger fires", async () => {
    await asActor(db, { kind: "service" }, async () => {
      await db.query(`update public.payments set status = 'pending' where id = $1`, [PAYMENT_A]);
    });
    await asActor(db, { kind: "service" }, async () => {
      await db.query(`update public.payments set status = 'confirmed' where id = $1`, [PAYMENT_A]);
    });

    const r = await asActor(db, { kind: "service" }, async () => {
      const res = await db.query<{ status: string; bumped: boolean }>(
        `select status::text, (updated_at > created_at) as bumped from public.payments where id = $1`,
        [PAYMENT_A],
      );
      return res.rows[0]!;
    });
    expect(r.status).toBe("confirmed");
    expect(r.bumped).toBe(true);
  });
});

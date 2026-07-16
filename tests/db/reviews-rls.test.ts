import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { type Actor, asActor, bootstrapDb, seedUser } from "./helpers/bootstrap";

/**
 * Review posture on real Postgres (PGlite): an author may review only their
 * own COMPLETED order, exactly once — and after 0007, may never publish it
 * themselves (insert or update). Publishing is an admin move through the same
 * user-scoped RLS path. Visibility: unpublished reviews exist only for their
 * author and admins; anon/strangers see published rows alone.
 */
const ALICE = "aaaaaaaa-0000-0000-0000-000000000001"; // reviews her completed order
const BOB = "bbbbbbbb-0000-0000-0000-000000000002"; // stranger
const BOOSTER = "cccccccc-0000-0000-0000-000000000003"; // actively assigned to ORDER_DONE
const ADMIN = "dddddddd-0000-0000-0000-000000000004";
const ORDER_DONE = "0a0a0a0a-0000-0000-0000-0000000000a1"; // alice, completed
const ORDER_WIP = "0c0c0c0c-0000-0000-0000-0000000000c3"; // alice, in_progress
const REVIEW_ID = "9a9a9a9a-0000-0000-0000-0000000000a1";

let db: PGlite;

async function count(actor: Actor, sql: string, params: unknown[] = []): Promise<number> {
  return asActor(db, actor, async () => {
    const r = await db.query<{ n: string }>(`select count(*)::text as n from (${sql}) q`, params);
    return Number(r.rows[0]!.n);
  });
}

/** INSERT as `actor`, returning the number of rows the statement created. */
async function insertReview(
  actor: Actor,
  values: { orderId: string; userId: string; isPublished?: boolean; id?: string },
): Promise<number> {
  return asActor(db, actor, async () => {
    const r = await db.query(
      `insert into public.reviews (id, order_id, user_id, rating, body, is_published)
       values (coalesce($1::uuid, gen_random_uuid()), $2, $3, 5, 'great boost', $4) returning id`,
      [values.id ?? null, values.orderId, values.userId, values.isPublished ?? false],
    );
    return r.rows.length;
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
  // Statuses are seeded directly (superuser setup) — the app-side transition
  // walk isn't under test here, the reviews policies are.
  for (const [id, status] of [
    [ORDER_DONE, "completed"],
    [ORDER_WIP, "in_progress"],
  ] as const) {
    await db.query(
      `insert into public.orders
         (id, user_id, game_slug, service_type, mode, region_code, config, subtotal_cents, total_cents, status)
       values ($1,$2,'valorant','rank_boost','piloted','na','{}'::jsonb, 5000, 5000, $3)`,
      [id, ALICE, status],
    );
  }
  // The booster stays actively assigned to the completed order — being a
  // participant must still not confer review rights (or unpublished reads).
  await db.query(`insert into public.order_assignments (order_id, booster_id) values ($1,$2)`, [
    ORDER_DONE,
    BOOSTER,
  ]);
});

afterAll(async () => {
  await db?.close();
});

// Ordering note: these describes run top-to-bottom in one database — the
// lifecycle is insert-guards → the one legal insert → visibility while
// unpublished → moderation (admin publish) → visibility after.

describe("review insert guards", () => {
  it("rejects the owner while the order is still in_progress", async () => {
    await expect(
      insertReview({ kind: "user", userId: ALICE }, { orderId: ORDER_WIP, userId: ALICE }),
    ).rejects.toThrow(/row-level security/);
  });

  it("rejects an author self-publishing on INSERT (0007 WITH CHECK)", async () => {
    await expect(
      insertReview(
        { kind: "user", userId: ALICE },
        { orderId: ORDER_DONE, userId: ALICE, isPublished: true },
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("rejects a stranger and even the assigned booster", async () => {
    await expect(
      insertReview({ kind: "user", userId: BOB }, { orderId: ORDER_DONE, userId: BOB }),
    ).rejects.toThrow(/row-level security/);
    await expect(
      insertReview({ kind: "user", userId: BOOSTER }, { orderId: ORDER_DONE, userId: BOOSTER }),
    ).rejects.toThrow(/row-level security/);
  });

  it("accepts the owner's unpublished review of the completed order", async () => {
    expect(
      await insertReview(
        { kind: "user", userId: ALICE },
        { orderId: ORDER_DONE, userId: ALICE, id: REVIEW_ID },
      ),
    ).toBe(1);
  });

  it("rejects a second review of the same order (UNIQUE order_id)", async () => {
    await expect(
      insertReview({ kind: "user", userId: ALICE }, { orderId: ORDER_DONE, userId: ALICE }),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("visibility while unpublished", () => {
  it("the author and admins see it; anon, strangers, and the booster do not", async () => {
    expect(await count({ kind: "user", userId: ALICE }, "select id from public.reviews")).toBe(1);
    expect(await count({ kind: "user", userId: ADMIN }, "select id from public.reviews")).toBe(1);
    expect(await count({ kind: "anon" }, "select id from public.reviews")).toBe(0);
    expect(await count({ kind: "user", userId: BOB }, "select id from public.reviews")).toBe(0);
    expect(await count({ kind: "user", userId: BOOSTER }, "select id from public.reviews")).toBe(0);
  });
});

describe("moderation (0007 policies)", () => {
  it("the author can still edit their unpublished review", async () => {
    const updated = await asActor(db, { kind: "user", userId: ALICE }, async () => {
      const r = await db.query(
        `update public.reviews set body = 'great boost, fast too' where id = $1 returning id`,
        [REVIEW_ID],
      );
      return r.rows.length;
    });
    expect(updated).toBe(1);
  });

  it("the author cannot self-publish via UPDATE", async () => {
    await expect(
      asActor(db, { kind: "user", userId: ALICE }, async () => {
        await db.query(`update public.reviews set is_published = true where id = $1`, [REVIEW_ID]);
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it("an admin publishes through user-scoped RLS", async () => {
    const published = await asActor(db, { kind: "user", userId: ADMIN }, async () => {
      const r = await db.query(
        `update public.reviews set is_published = true where id = $1 returning id`,
        [REVIEW_ID],
      );
      return r.rows.length;
    });
    expect(published).toBe(1);
  });

  it("once published, the author can no longer edit it (WITH CHECK keeps it admin-only)", async () => {
    await expect(
      asActor(db, { kind: "user", userId: ALICE }, async () => {
        await db.query(`update public.reviews set body = 'actually…' where id = $1`, [REVIEW_ID]);
      }),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("visibility once published", () => {
  it("published reviews are world-readable — anon and strangers included", async () => {
    expect(await count({ kind: "anon" }, "select id from public.reviews")).toBe(1);
    expect(await count({ kind: "user", userId: BOB }, "select id from public.reviews")).toBe(1);
    expect(await count({ kind: "user", userId: BOOSTER }, "select id from public.reviews")).toBe(1);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { type Actor, asActor, bootstrapDb, seedUser } from "./helpers/bootstrap";

/**
 * Phase 3 booster status walk on real Postgres (PGlite): the ACTIVE assigned
 * booster can move orders.status through user-scoped RLS
 * (orders_update_owner_or_staff, column-unrestricted — the app's
 * canBoosterAdvance + status-predicated UPDATE are the real state machine,
 * risk #5) and insert the matching order_progress row
 * (order_progress_insert_staff). A stranger booster and a revoked booster get
 * zero-row updates / RLS rejections; the customer reads progress but never
 * writes it; a second predicated update is a zero-row no-op (double-advance
 * guard). Mirrors what app/(booster)/booster/orders/[id]/actions.ts does.
 */
const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const BOOSTER = "cccccccc-0000-0000-0000-000000000003";
const RIVAL = "eeeeeeee-0000-0000-0000-000000000005";
const ORDER_A = "0a0a0a0a-0000-0000-0000-0000000000a1";

let db: PGlite;

async function count(actor: Actor, sql: string, params: unknown[] = []): Promise<number> {
  return asActor(db, actor, async () => {
    const r = await db.query<{ n: string }>(`select count(*)::text as n from (${sql}) q`, params);
    return Number(r.rows[0]!.n);
  });
}

/**
 * The exact write the booster action issues: a status-predicated UPDATE
 * through user-scoped RLS. Returns the number of rows moved — RLS-invisible
 * rows and stale predicates both surface as 0, never as an error.
 */
async function advance(userId: string, from: string, to: string): Promise<number> {
  return asActor(db, { kind: "user", userId }, async () => {
    const r = await db.query<{ id: string }>(
      `update public.orders set status = $2::order_status
       where id = $1 and status = $3::order_status
       returning id`,
      [ORDER_A, to, from],
    );
    return r.rows.length;
  });
}

async function insertProgress(userId: string, from: string, to: string): Promise<void> {
  await asActor(db, { kind: "user", userId }, async () => {
    await db.query(
      `insert into public.order_progress (order_id, status_from, status_to, created_by)
       values ($1, $2::order_status, $3::order_status, $4)`,
      [ORDER_A, from, to, userId],
    );
  });
}

beforeAll(async () => {
  db = await bootstrapDb();

  await seedUser(db, { id: OWNER, role: "customer" });
  await seedUser(db, { id: BOOSTER, role: "booster" });
  await seedUser(db, { id: RIVAL, role: "booster" });

  // Minimal catalog row so the orders FK is satisfied.
  await db.query(
    `insert into public.games (slug, name, short_name, divisions_per_tier) values ($1,$2,$3,$4)`,
    ["valorant", "Valorant", "VAL", 3],
  );

  // An assigned order with BOOSTER holding the active assignment (superuser
  // setup — assignment writes are service-role in the app, pinned elsewhere).
  await db.query(
    `insert into public.orders
       (id, user_id, game_slug, service_type, mode, region_code, config, status, subtotal_cents, total_cents)
     values ($1,$2,'valorant','rank_boost','piloted','na','{}'::jsonb,'assigned', 5000, 5000)`,
    [ORDER_A, OWNER],
  );
  await db.query(`insert into public.order_assignments (order_id, booster_id) values ($1,$2)`, [
    ORDER_A,
    BOOSTER,
  ]);
});

afterAll(async () => {
  await db?.close();
});

describe("customer position", () => {
  it("the customer cannot insert progress rows on their own order", async () => {
    await expect(insertProgress(OWNER, "assigned", "in_progress")).rejects.toThrow(
      /row-level security/,
    );
  });
});

describe("stranger booster is fully blocked", () => {
  it("a booster without the assignment moves zero rows on update", async () => {
    expect(await advance(RIVAL, "assigned", "in_progress")).toBe(0);
  });

  it("a booster without the assignment cannot insert progress", async () => {
    await expect(insertProgress(RIVAL, "assigned", "in_progress")).rejects.toThrow(
      /row-level security/,
    );
  });
});

describe("active booster walks the order through RLS", () => {
  it("advances assigned→in_progress with a status-predicated update", async () => {
    expect(await advance(BOOSTER, "assigned", "in_progress")).toBe(1);
  });

  it("a second identical predicated update is a zero-row no-op (double-advance guard)", async () => {
    expect(await advance(BOOSTER, "assigned", "in_progress")).toBe(0);
  });

  it("inserts the matching order_progress row (order_progress_insert_staff)", async () => {
    await insertProgress(BOOSTER, "assigned", "in_progress");
    expect(
      await count(
        { kind: "user", userId: BOOSTER },
        `select id from public.order_progress where order_id = '${ORDER_A}'`,
      ),
    ).toBe(1);
  });

  it("the customer can read the booster's progress row", async () => {
    expect(
      await count(
        { kind: "user", userId: OWNER },
        `select id from public.order_progress where order_id = '${ORDER_A}'`,
      ),
    ).toBe(1);
  });
});

describe("revocation flips every path off (risk #6)", () => {
  beforeAll(async () => {
    // Unassign the way the app does: is_active=false + unassigned_at (there is
    // no released_at) — service role, matching the grant trap on this table.
    await asActor(db, { kind: "service" }, async () => {
      await db.query(
        `update public.order_assignments
         set is_active = false, unassigned_at = now()
         where order_id = $1 and booster_id = $2`,
        [ORDER_A, BOOSTER],
      );
    });
  });

  it("the revoked booster no longer sees the order at all", async () => {
    expect(
      await count(
        { kind: "user", userId: BOOSTER },
        `select id from public.orders where id = '${ORDER_A}'`,
      ),
    ).toBe(0);
  });

  it("the revoked booster's status update matches zero rows", async () => {
    expect(await advance(BOOSTER, "in_progress", "paused")).toBe(0);
  });

  it("the revoked booster cannot insert progress anymore", async () => {
    await expect(insertProgress(BOOSTER, "in_progress", "paused")).rejects.toThrow(
      /row-level security/,
    );
  });

  it("the revoked booster still sees their own assignment row (booster-desk history)", async () => {
    // The /booster "past assignments" section renders from exactly this:
    // order_assignments_select keeps own rows visible after revocation even
    // though the order itself has vanished.
    expect(
      await count(
        { kind: "user", userId: BOOSTER },
        `select id from public.order_assignments where booster_id = '${BOOSTER}' and is_active = false`,
      ),
    ).toBe(1);
  });
});

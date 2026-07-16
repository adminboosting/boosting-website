import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { type Actor, asActor, bootstrapDb, seedUser } from "./helpers/bootstrap";

/**
 * Order chat posture on real Postgres (PGlite): the full participant matrix
 * over order_messages {select, insert}, the sender_id spoof, the admin
 * system-message path, the client-immutability of messages (no UPDATE/DELETE
 * grant for authenticated — not even admins), and message_reads staying
 * strictly self-scoped. Also pins the revocation cliff: an unassigned booster
 * keeps their own old receipts but loses every message the instant
 * can_access_order() flips false.
 */
const ALICE = "aaaaaaaa-0000-0000-0000-000000000001"; // order owner
const BOB = "bbbbbbbb-0000-0000-0000-000000000002"; // stranger
const BOOSTER = "cccccccc-0000-0000-0000-000000000003"; // active assignment
const REVOKED = "eeeeeeee-0000-0000-0000-000000000005"; // assigned, then unassigned
const ADMIN = "dddddddd-0000-0000-0000-000000000004";
const ORDER_A = "0a0a0a0a-0000-0000-0000-0000000000a1";
const MSG_ALICE = "5a5a5a5a-0000-0000-0000-0000000000a1"; // seeded, from ALICE
const MSG_BOOSTER = "5b5b5b5b-0000-0000-0000-0000000000b2"; // seeded, from BOOSTER

let db: PGlite;

async function count(actor: Actor, sql: string, params: unknown[] = []): Promise<number> {
  return asActor(db, actor, async () => {
    const r = await db.query<{ n: string }>(`select count(*)::text as n from (${sql}) q`, params);
    return Number(r.rows[0]!.n);
  });
}

/** INSERT as `actor`, returning the number of rows the statement created. */
async function insertMessage(
  actor: Actor,
  values: { sender_id: string | null; body: string; is_system?: boolean },
): Promise<number> {
  return asActor(db, actor, async () => {
    const r = await db.query(
      `insert into public.order_messages (order_id, sender_id, body, is_system)
       values ($1, $2, $3, $4) returning id`,
      [ORDER_A, values.sender_id, values.body, values.is_system ?? false],
    );
    return r.rows.length;
  });
}

beforeAll(async () => {
  db = await bootstrapDb();

  await seedUser(db, { id: ALICE, role: "customer" });
  await seedUser(db, { id: BOB, role: "customer" });
  await seedUser(db, { id: BOOSTER, role: "booster" });
  await seedUser(db, { id: REVOKED, role: "booster" });
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

  // REVOKED worked this order first, then was unassigned (the release shape the
  // admin action writes: is_active=false + unassigned_at — no released_at
  // column exists). The partial unique index only bites on ACTIVE rows, so the
  // follow-up active assignment for BOOSTER coexists with the dead one.
  await db.query(`insert into public.order_assignments (order_id, booster_id) values ($1,$2)`, [
    ORDER_A,
    REVOKED,
  ]);
  await db.query(
    `update public.order_assignments
       set is_active = false, unassigned_at = now() where booster_id = $1`,
    [REVOKED],
  );
  await db.query(`insert into public.order_assignments (order_id, booster_id) values ($1,$2)`, [
    ORDER_A,
    BOOSTER,
  ]);

  // Two seeded messages (one per human side) and REVOKED's receipt from their
  // active days — superuser setup, not an assertion.
  await db.query(
    `insert into public.order_messages (id, order_id, sender_id, body) values ($1,$2,$3,'hi, any update?')`,
    [MSG_ALICE, ORDER_A, ALICE],
  );
  await db.query(
    `insert into public.order_messages (id, order_id, sender_id, body) values ($1,$2,$3,'starting tonight')`,
    [MSG_BOOSTER, ORDER_A, BOOSTER],
  );
  await db.query(`insert into public.message_reads (message_id, user_id) values ($1,$2)`, [
    MSG_ALICE,
    REVOKED,
  ]);
});

afterAll(async () => {
  await db?.close();
});

describe("order_messages select matrix", () => {
  it("owner, active booster, and admin read the thread", async () => {
    expect(
      await count({ kind: "user", userId: ALICE }, "select id from public.order_messages"),
    ).toBe(2);
    expect(
      await count({ kind: "user", userId: BOOSTER }, "select id from public.order_messages"),
    ).toBe(2);
    expect(
      await count({ kind: "user", userId: ADMIN }, "select id from public.order_messages"),
    ).toBe(2);
  });

  it("a stranger sees nothing", async () => {
    expect(await count({ kind: "user", userId: BOB }, "select id from public.order_messages")).toBe(
      0,
    );
  });

  it("a revoked booster sees nothing — can_access_order flips off instantly", async () => {
    expect(
      await count({ kind: "user", userId: REVOKED }, "select id from public.order_messages"),
    ).toBe(0);
  });

  it("anon cannot read messages at all (no grant)", async () => {
    await expect(count({ kind: "anon" }, "select id from public.order_messages")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("order_messages insert matrix", () => {
  it("owner and active booster insert with their own sender_id", async () => {
    expect(
      await insertMessage({ kind: "user", userId: ALICE }, { sender_id: ALICE, body: "thanks!" }),
    ).toBe(1);
    expect(
      await insertMessage({ kind: "user", userId: BOOSTER }, { sender_id: BOOSTER, body: "np" }),
    ).toBe(1);
  });

  it("sender_id spoofing is rejected for non-admins", async () => {
    await expect(
      insertMessage({ kind: "user", userId: ALICE }, { sender_id: BOB, body: "as bob" }),
    ).rejects.toThrow(/row-level security/);
    await expect(
      insertMessage({ kind: "user", userId: BOOSTER }, { sender_id: ALICE, body: "as alice" }),
    ).rejects.toThrow(/row-level security/);
  });

  it("a stranger and a revoked booster cannot insert", async () => {
    await expect(
      insertMessage({ kind: "user", userId: BOB }, { sender_id: BOB, body: "let me in" }),
    ).rejects.toThrow(/row-level security/);
    await expect(
      insertMessage({ kind: "user", userId: REVOKED }, { sender_id: REVOKED, body: "still here?" }),
    ).rejects.toThrow(/row-level security/);
  });

  it("an admin may insert with an arbitrary sender (the policy's system-message path)", async () => {
    // The app only writes is_system rows through the service role, but the
    // policy deliberately lets admins author messages with sender_id null —
    // pin that this is an ADMIN privilege, not a general one.
    expect(
      await insertMessage(
        { kind: "user", userId: ADMIN },
        { sender_id: null, body: "Booster assigned", is_system: true },
      ),
    ).toBe(1);
  });

  it("anon cannot insert at all (no grant)", async () => {
    await expect(
      insertMessage({ kind: "anon" }, { sender_id: null, body: "drive-by" }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("order_messages are client-immutable (no UPDATE/DELETE grant)", () => {
  it.each([
    ["owner", ALICE],
    ["admin", ADMIN],
  ])("%s cannot UPDATE a message", async (_label, userId) => {
    await expect(
      asActor(db, { kind: "user", userId }, async () => {
        await db.query(`update public.order_messages set body = 'edited' where id = $1`, [
          MSG_ALICE,
        ]);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it.each([
    ["owner", ALICE],
    ["admin", ADMIN],
  ])("%s cannot DELETE a message", async (_label, userId) => {
    await expect(
      asActor(db, { kind: "user", userId }, async () => {
        await db.query(`delete from public.order_messages where id = $1`, [MSG_ALICE]);
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("message_reads is strictly self-scoped", () => {
  it("marking own receipts works and re-marking is a free no-op (the upsert shape)", async () => {
    for (let i = 0; i < 2; i++) {
      await asActor(db, { kind: "user", userId: ALICE }, async () => {
        await db.query(
          `insert into public.message_reads (message_id, user_id)
           values ($1, $2) on conflict (message_id, user_id) do nothing`,
          [MSG_BOOSTER, ALICE],
        );
      });
    }
    expect(
      await count(
        { kind: "user", userId: ALICE },
        `select message_id from public.message_reads where message_id = '${MSG_BOOSTER}'`,
      ),
    ).toBe(1);
  });

  it("marking a message read for ANOTHER user is rejected", async () => {
    await expect(
      asActor(db, { kind: "user", userId: ALICE }, async () => {
        await db.query(`insert into public.message_reads (message_id, user_id) values ($1,$2)`, [
          MSG_BOOSTER,
          BOB,
        ]);
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it("nobody sees another user's receipts — no 'seen' indicator is possible", async () => {
    // REVOKED's receipt on MSG_ALICE exists, but ALICE (the sender) can't see it…
    expect(
      await count(
        { kind: "user", userId: ALICE },
        `select message_id from public.message_reads where message_id = '${MSG_ALICE}'`,
      ),
    ).toBe(0);
    // …and not even an admin can, through PostgREST (policy has no is_admin arm).
    expect(
      await count(
        { kind: "user", userId: ADMIN },
        `select message_id from public.message_reads where user_id = '${REVOKED}'`,
      ),
    ).toBe(0);
  });

  it("a revoked booster keeps their old receipts but not the messages", async () => {
    // The receipt row survives revocation (policy checks only user_id)…
    expect(
      await count({ kind: "user", userId: REVOKED }, "select message_id from public.message_reads"),
    ).toBe(1);
    // …while the messages themselves are already gone (select matrix above).
    expect(
      await count({ kind: "user", userId: REVOKED }, "select id from public.order_messages"),
    ).toBe(0);
  });
});

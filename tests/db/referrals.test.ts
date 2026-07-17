import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { type Actor, asActor, bootstrapDb, seedUser } from "./helpers/bootstrap";

/**
 * Referrals posture on real Postgres (PGlite), pinning the share-row +
 * per-attribution-row model that lib/referrals/service.ts implements ("plan
 * risk #4"): a user's shareable code lives on a row with `referred_id` NULL
 * that is never claimed, and every signup that arrives through it gets its
 * OWN row with a freshly generated code — because `code` is UNIQUE per row,
 * updating the share row instead would strand the second referral.
 *
 * The service module is "server-only" (not importable here), so
 * attributeReferralSql replicates its exact SQL semantics: share-row lookup
 * (referred_id IS NULL), self-referral no-op, one-attribution-per-referred-
 * user no-op, fresh-code insert. RLS: participants + admin SELECT only; all
 * writes are service-role (authenticated holds a SELECT grant alone).
 */
const ALICE = "aaaaaaaa-0000-0000-0000-000000000001"; // referrer with a share row
const BOB = "bbbbbbbb-0000-0000-0000-000000000002"; // signs up through Alice's code
const CARA = "cccccccc-0000-0000-0000-000000000003"; // second referrer / third party
const DAVE = "dddddddd-0000-0000-0000-000000000004"; // never referred, never referring
const ADMIN = "eeeeeeee-0000-0000-0000-000000000005";

const ALICE_SHARE_CODE = "ALICE4US";
const CARA_SHARE_CODE = "CARA2WIN";

let db: PGlite;

async function count(actor: Actor, sql: string, params: unknown[] = []): Promise<number> {
  return asActor(db, actor, async () => {
    const r = await db.query<{ n: string }>(`select count(*)::text as n from (${sql}) q`, params);
    return Number(r.rows[0]!.n);
  });
}

/**
 * Mirror of lib/referrals/service.ts#attributeReferral as service-role SQL.
 * Returns the number of attribution rows created (0 = no-op, 1 = attributed).
 */
async function attributeReferralSql(
  code: string,
  referredUserId: string,
  freshCode: string,
): Promise<number> {
  return asActor(db, { kind: "service" }, async () => {
    // Share rows only — an attribution row's code is not shareable.
    const share = await db.query<{ referrer_id: string }>(
      `select referrer_id from public.referrals where code = $1 and referred_id is null`,
      [code],
    );
    const referrerId = share.rows[0]?.referrer_id;
    if (!referrerId || referrerId === referredUserId) return 0;

    // One attribution per referred user, ever.
    const prior = await db.query(`select id from public.referrals where referred_id = $1`, [
      referredUserId,
    ]);
    if (prior.rows.length > 0) return 0;

    const inserted = await db.query(
      `insert into public.referrals (referrer_id, referred_id, code, status)
       values ($1, $2, $3, 'pending') returning id`,
      [referrerId, referredUserId, freshCode],
    );
    return inserted.rows.length;
  });
}

beforeAll(async () => {
  db = await bootstrapDb();

  await seedUser(db, { id: ALICE, role: "customer" });
  await seedUser(db, { id: BOB, role: "customer" });
  await seedUser(db, { id: CARA, role: "customer" });
  await seedUser(db, { id: DAVE, role: "customer" });
  await seedUser(db, { id: ADMIN, role: "admin" });
});

afterAll(async () => {
  await db?.close();
});

// Ordering note: these describes run top-to-bottom in one database — the
// lifecycle is share-row create → attribution → no-op guards → RLS.

describe("share-row creation (getOrCreateShareCode semantics)", () => {
  it("the service role creates a share row with referred_id NULL", async () => {
    const created = await asActor(db, { kind: "service" }, async () => {
      const r = await db.query(
        `insert into public.referrals (referrer_id, code) values ($1, $2) returning id`,
        [ALICE, ALICE_SHARE_CODE],
      );
      return r.rows.length;
    });
    expect(created).toBe(1);
  });

  it("a second row with the same code violates the UNIQUE constraint (why attributions need fresh codes)", async () => {
    await expect(
      asActor(db, { kind: "service" }, async () => {
        await db.query(
          `insert into public.referrals (referrer_id, referred_id, code, status)
           values ($1, $2, $3, 'pending')`,
          [ALICE, BOB, ALICE_SHARE_CODE],
        );
      }),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("attribution (attributeReferral semantics)", () => {
  it("inserts a NEW row with a distinct code; the share row stays unclaimed", async () => {
    expect(await attributeReferralSql(ALICE_SHARE_CODE, BOB, "BOBFRESH")).toBe(1);

    const rows = await asActor(db, { kind: "service" }, async () => {
      const r = await db.query<{ code: string; referred_id: string | null; status: string }>(
        `select code, referred_id, status::text as status
         from public.referrals where referrer_id = $1 order by created_at`,
        [ALICE],
      );
      return r.rows;
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ code: ALICE_SHARE_CODE, referred_id: null });
    expect(rows[1]).toMatchObject({ code: "BOBFRESH", referred_id: BOB, status: "pending" });
  });

  it("self-referral is a no-op", async () => {
    expect(await attributeReferralSql(ALICE_SHARE_CODE, ALICE, "SELFCODE")).toBe(0);
  });

  it("a second attribution for the same referred user is a no-op (first code wins)", async () => {
    // Cara shares her own code, but Bob already has an attribution row.
    await asActor(db, { kind: "service" }, async () => {
      await db.query(`insert into public.referrals (referrer_id, code) values ($1, $2)`, [
        CARA,
        CARA_SHARE_CODE,
      ]);
    });
    expect(await attributeReferralSql(CARA_SHARE_CODE, BOB, "BOBAGAIN")).toBe(0);
  });

  it("an attribution row's code is not shareable (share lookup requires referred_id NULL)", async () => {
    expect(await attributeReferralSql("BOBFRESH", DAVE, "DAVENOPE")).toBe(0);
  });

  it("an unknown code is a no-op", async () => {
    expect(await attributeReferralSql("NOSUCHCD", DAVE, "DAVENOPE")).toBe(0);
  });
});

// State at this point: ALICE share row + ALICE→BOB attribution, CARA share row.

describe("referrals RLS — participants + admin read, nobody else", () => {
  it("the referrer sees their share row and their attributions", async () => {
    expect(await count({ kind: "user", userId: ALICE }, "select id from public.referrals")).toBe(2);
    expect(await count({ kind: "user", userId: CARA }, "select id from public.referrals")).toBe(1);
  });

  it("the referred user sees only the attribution row naming them", async () => {
    expect(await count({ kind: "user", userId: BOB }, "select id from public.referrals")).toBe(1);
    expect(
      await count(
        { kind: "user", userId: BOB },
        "select id from public.referrals where referred_id is null",
      ),
    ).toBe(0);
  });

  it("a third party sees nothing; an admin sees everything", async () => {
    expect(await count({ kind: "user", userId: DAVE }, "select id from public.referrals")).toBe(0);
    expect(await count({ kind: "user", userId: ADMIN }, "select id from public.referrals")).toBe(3);
  });

  it("anon cannot read referrals at all (no grant)", async () => {
    await expect(count({ kind: "anon" }, "select id from public.referrals")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("referrals are write-protected from authenticated users", () => {
  it("an authenticated user cannot INSERT even their own share row (no grant)", async () => {
    await expect(
      asActor(db, { kind: "user", userId: DAVE }, async () => {
        await db.query(`insert into public.referrals (referrer_id, code) values ($1, $2)`, [
          DAVE,
          "DAVETRIX",
        ]);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("an authenticated referrer cannot UPDATE their rows to 'rewarded' (no grant)", async () => {
    await expect(
      asActor(db, { kind: "user", userId: ALICE }, async () => {
        await db.query(
          `update public.referrals set status = 'rewarded', reward_cents = 99999
           where referrer_id = $1`,
          [ALICE],
        );
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

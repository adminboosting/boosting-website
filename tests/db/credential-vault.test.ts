import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { decryptCredentials, encryptCredentials } from "@/lib/credentials/vault";
import { type Actor, asActor, bootstrapDb, seedUser } from "./helpers/bootstrap";

/**
 * True end-to-end vault roundtrip on real Postgres (PGlite): a payload is
 * encrypted by lib/credentials/vault.ts, stored in the deny-all
 * order_credentials table by the service role, read back, and decrypted.
 * Also replicates the retention-purge predicate from
 * lib/credentials/store.ts#purgeCredentialsForFinishedOrders against real rows
 * (store.ts itself imports "server-only" and cannot run here), and pins the
 * admin-read-only posture of credential_access_log.
 */
const ALICE = "aaaaaaaa-0000-0000-0000-000000000001";
const BOOSTER = "cccccccc-0000-0000-0000-000000000003";
const ADMIN = "dddddddd-0000-0000-0000-000000000004";
const ORDER_LIVE = "0a0a0a0a-0000-0000-0000-0000000000a1"; // paid, credentials in use
const ORDER_DONE = "0d0d0d0d-0000-0000-0000-0000000000d1"; // completed 40 days ago
const ORDER_FRESH = "0f0f0f0f-0000-0000-0000-0000000000f1"; // completed yesterday

const PAYLOAD = { username: "frog_main", password: "s3cret-lilypad", note: "EUW alt" };

/** Days the purge test retains credentials for (mirrors the cron's constant role). */
const RETENTION_DAYS = 30;

let db: PGlite;

async function count(actor: Actor, sql: string, params: unknown[] = []): Promise<number> {
  return asActor(db, actor, async () => {
    const r = await db.query<{ n: string }>(`select count(*)::text as n from (${sql}) q`, params);
    return Number(r.rows[0]!.n);
  });
}

/** Service-role insert of an encrypted envelope, the way store.ts writes it. */
async function insertEnvelope(orderId: string, plaintext: string): Promise<void> {
  const envelope = encryptCredentials(plaintext);
  await asActor(db, { kind: "service" }, async () => {
    await db.query(
      `insert into public.order_credentials (order_id, ciphertext, iv, auth_tag, algo)
       values ($1,$2,$3,$4,$5)`,
      [orderId, envelope.ciphertext, envelope.iv, envelope.authTag, envelope.algo],
    );
  });
}

/**
 * The purge UPDATE store.ts issues, expressed as the equivalent SQL: blank the
 * envelope of live credentials whose parent order finished more than
 * `retentionDays` ago ("finished at" = completed_at, else updated_at).
 */
async function runPurge(retentionDays: number): Promise<number> {
  return asActor(db, { kind: "service" }, async () => {
    const r = await db.query<{ id: string }>(
      `update public.order_credentials c
       set ciphertext = '', iv = '', auth_tag = '', deleted_at = now()
       from public.orders o
       where o.id = c.order_id
         and c.deleted_at is null
         and o.status in ('completed','cancelled','refunded')
         and coalesce(o.completed_at, o.updated_at) < now() - make_interval(days => $1)
       returning c.id`,
      [retentionDays],
    );
    return r.rows.length;
  });
}

beforeAll(async () => {
  // The vault reads the key at call time; 32 random bytes make a valid AES-256 key.
  process.env.CREDENTIAL_MASTER_KEY = randomBytes(32).toString("base64");

  db = await bootstrapDb();

  await seedUser(db, { id: ALICE, role: "customer" });
  await seedUser(db, { id: BOOSTER, role: "booster" });
  await seedUser(db, { id: ADMIN, role: "admin" });

  // Minimal catalog row so the orders FK is satisfied.
  await db.query(
    `insert into public.games (slug, name, short_name, divisions_per_tier) values ($1,$2,$3,$4)`,
    ["valorant", "Valorant", "VAL", 3],
  );
  // No DB state machine on status — inserting terminal rows directly is fine
  // for setup. completed_at drives the purge cutoff for completed orders.
  for (const [id, status, completedAt] of [
    [ORDER_LIVE, "paid", null],
    [ORDER_DONE, "completed", "now() - interval '40 days'"],
    [ORDER_FRESH, "completed", "now() - interval '1 day'"],
  ] as const) {
    await db.query(
      `insert into public.orders
         (id, user_id, game_slug, service_type, mode, region_code, config,
          status, subtotal_cents, total_cents, completed_at)
       values ($1,$2,'valorant','rank_boost','piloted','na','{}'::jsonb,
               $3, 5000, 5000, ${completedAt ?? "null"})`,
      [id, ALICE, status],
    );
  }
});

afterAll(async () => {
  delete process.env.CREDENTIAL_MASTER_KEY;
  await db?.close();
});

describe("encrypted roundtrip through the database", () => {
  it("service role stores the envelope and decrypts it back to the plaintext", async () => {
    await insertEnvelope(ORDER_LIVE, JSON.stringify(PAYLOAD));

    const row = await asActor(db, { kind: "service" }, async () => {
      const r = await db.query<{ ciphertext: string; iv: string; auth_tag: string; algo: string }>(
        `select ciphertext, iv, auth_tag, algo from public.order_credentials where order_id = $1`,
        [ORDER_LIVE],
      );
      return r.rows[0]!;
    });

    expect(row.algo).toBe("aes-256-gcm");
    expect(row.ciphertext).not.toContain(PAYLOAD.password); // never plaintext at rest
    expect(
      JSON.parse(
        decryptCredentials({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag }),
      ),
    ).toEqual(PAYLOAD);
  });

  it("resubmission upserts on the UNIQUE(order_id) slot and revives deleted_at", async () => {
    const next = { username: "frog_alt", password: "new-pass", note: undefined };
    const envelope = encryptCredentials(JSON.stringify(next));
    await asActor(db, { kind: "service" }, async () => {
      await db.query(
        `insert into public.order_credentials (order_id, ciphertext, iv, auth_tag, algo)
         values ($1,$2,$3,$4,$5)
         on conflict (order_id) do update
           set ciphertext = excluded.ciphertext, iv = excluded.iv,
               auth_tag = excluded.auth_tag, algo = excluded.algo, deleted_at = null`,
        [ORDER_LIVE, envelope.ciphertext, envelope.iv, envelope.authTag, envelope.algo],
      );
    });

    expect(
      await count(
        { kind: "service" },
        `select id from public.order_credentials where order_id = '${ORDER_LIVE}'`,
      ),
    ).toBe(1);

    const row = await asActor(db, { kind: "service" }, async () => {
      const r = await db.query<{ ciphertext: string; iv: string; auth_tag: string }>(
        `select ciphertext, iv, auth_tag from public.order_credentials
         where order_id = $1 and deleted_at is null`,
        [ORDER_LIVE],
      );
      return r.rows[0]!;
    });
    expect(
      JSON.parse(
        decryptCredentials({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag }),
      ),
    ).toEqual({ username: "frog_alt", password: "new-pass" });
  });
});

describe("deny-all posture (RLS + force RLS + zero grants)", () => {
  it("no authenticated actor — owner, booster, or admin — can read credentials", async () => {
    for (const userId of [ALICE, BOOSTER, ADMIN]) {
      await expect(
        count({ kind: "user", userId }, "select id from public.order_credentials"),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("anon is rejected too", async () => {
    await expect(count({ kind: "anon" }, "select id from public.order_credentials")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("retention purge (replicates store.ts purge predicate)", () => {
  it("blanks only credentials of orders finished beyond the retention window", async () => {
    await insertEnvelope(ORDER_DONE, JSON.stringify(PAYLOAD));
    await insertEnvelope(ORDER_FRESH, JSON.stringify(PAYLOAD));

    expect(await runPurge(RETENTION_DAYS)).toBe(1); // ORDER_DONE only

    const rows = await asActor(db, { kind: "service" }, async () => {
      const r = await db.query<{ order_id: string; ciphertext: string; deleted: boolean }>(
        `select order_id, ciphertext, (deleted_at is not null) as deleted
         from public.order_credentials order by order_id`,
      );
      return r.rows;
    });
    const byOrder = new Map(rows.map((row) => [row.order_id, row]));

    expect(byOrder.get(ORDER_DONE)).toMatchObject({ ciphertext: "", deleted: true });
    // Recently finished and still-active orders keep their envelopes.
    expect(byOrder.get(ORDER_FRESH)!.deleted).toBe(false);
    expect(byOrder.get(ORDER_FRESH)!.ciphertext).not.toBe("");
    expect(byOrder.get(ORDER_LIVE)!.deleted).toBe(false);
  });

  it("is idempotent: a second run blanks nothing (deleted_at rows are skipped)", async () => {
    expect(await runPurge(RETENTION_DAYS)).toBe(0);
  });
});

describe("credential_access_log is admin-read, service-write", () => {
  it("the service role writes trail rows; only admins read them", async () => {
    await asActor(db, { kind: "service" }, async () => {
      await db.query(
        `insert into public.credential_access_log (order_id, accessed_by, action)
         values ($1,$2,'store')`,
        [ORDER_LIVE, ALICE],
      );
    });

    expect(
      await count({ kind: "user", userId: ADMIN }, "select id from public.credential_access_log"),
    ).toBe(1);
    // Non-admins hold the SELECT grant but the policy filters every row.
    expect(
      await count({ kind: "user", userId: ALICE }, "select id from public.credential_access_log"),
    ).toBe(0);
  });

  it("authenticated users cannot insert log rows (no grant)", async () => {
    await expect(
      asActor(db, { kind: "user", userId: ALICE }, async () => {
        await db.query(
          `insert into public.credential_access_log (order_id, accessed_by, action)
           values ($1,$2,'store')`,
          [ORDER_LIVE, ALICE],
        );
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

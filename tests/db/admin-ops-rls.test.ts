import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { type Actor, asActor, bootstrapDb, seedUser } from "./helpers/bootstrap";

/**
 * Write-path posture of the Phase-3 admin surfaces, on real Postgres (PGlite).
 * Two opposite postures are pinned so neither drifts:
 *
 *  - coupons: full DML grant + coupons_admin_all — admin CRUD works through
 *    the USER-scoped client (app/(admin)/admin/coupons/actions.ts relies on
 *    exactly this; RLS is the proof, not the service role).
 *  - site_settings + booster_profiles INSERT + audit_log: policies may say
 *    admin, but the grants are SELECT-only (settings/audit) or missing INSERT
 *    (booster_profiles) — writes are service-role territory
 *    (settings/actions.ts, boosters/actions.ts). Widening a grant to make a
 *    red test green here is the exact regression these tests exist to catch.
 */
const ALICE = "aaaaaaaa-0000-0000-0000-000000000001";
const BOOSTER = "cccccccc-0000-0000-0000-000000000003";
const CANDIDATE = "eeeeeeee-0000-0000-0000-000000000005";
const ADMIN = "dddddddd-0000-0000-0000-000000000004";

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
  await seedUser(db, { id: BOOSTER, role: "booster" });
  await seedUser(db, { id: CANDIDATE, role: "customer" });
  await seedUser(db, { id: ADMIN, role: "admin" });

  // Superuser test setup (not an assertion): a booster row for the self-update
  // check, two coupons (one consumed), and the seeded settings keys the
  // migrations alone don't provide (supabase/seed.sql isn't applied here).
  await db.query(`insert into public.booster_profiles (id) values ($1)`, [BOOSTER]);
  await db.query(
    `insert into public.coupons (code, kind, amount, min_order_cents, uses, is_active)
     values ('WELCOME10', 'percent'::coupon_kind, 1000, 2000, 0, true),
            ('USED5', 'flat'::coupon_kind, 500, 0, 3, true)`,
  );
  await db.query(
    `insert into public.site_settings (key, value)
     values ('pricing_reviewed', 'false'::jsonb), ('brand_name', '"RankedFrogs"'::jsonb)`,
  );
});

afterAll(async () => {
  await db?.close();
});

describe("coupons: admin CRUD passes through user-scoped RLS (the deliberate non-service surface)", () => {
  it("an admin can INSERT, UPDATE, and DELETE coupons as `authenticated`", async () => {
    await asActor(db, { kind: "user", userId: ADMIN }, async () => {
      await db.query(
        `insert into public.coupons (code, kind, amount, min_order_cents, is_active)
         values ('SUMMER25', 'percent'::coupon_kind, 2500, 0, true)`,
      );
    });
    expect(
      await count(
        { kind: "user", userId: ADMIN },
        `select code from public.coupons where code = 'SUMMER25'`,
      ),
    ).toBe(1);

    await asActor(db, { kind: "user", userId: ADMIN }, async () => {
      const updated = await db.query<{ code: string }>(
        `update public.coupons set amount = 1500 where code = 'WELCOME10' returning code`,
      );
      expect(updated.rows).toHaveLength(1);
    });

    await asActor(db, { kind: "user", userId: ADMIN }, async () => {
      const deleted = await db.query<{ code: string }>(
        `delete from public.coupons where code = 'SUMMER25' returning code`,
      );
      expect(deleted.rows).toHaveLength(1);
    });
  });

  it("a customer sees zero coupons (policy filter, not a grant error)", async () => {
    expect(await count({ kind: "user", userId: ALICE }, "select code from public.coupons")).toBe(0);
  });

  it("a customer cannot INSERT a coupon — RLS WITH CHECK, not the grant, rejects it", async () => {
    await expect(
      asActor(db, { kind: "user", userId: ALICE }, async () => {
        await db.query(
          `insert into public.coupons (code, kind, amount) values ('HAX', 'flat'::coupon_kind, 1)`,
        );
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it("a customer UPDATE silently matches zero rows (USING filter)", async () => {
    const updated = await asActor(db, { kind: "user", userId: ALICE }, async () => {
      const r = await db.query<{ code: string }>(
        `update public.coupons set is_active = false where code = 'WELCOME10' returning code`,
      );
      return r.rows.length;
    });
    expect(updated).toBe(0);
  });

  it("anon cannot read coupons at all (no grant)", async () => {
    await expect(count({ kind: "anon" }, "select code from public.coupons")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("site_settings: SELECT-only authenticated grant blocks writes despite the admin policy (grant trap)", () => {
  it("everyone reads settings — anon included (public config)", async () => {
    // 3 rows: the two keys inserted in beforeAll (pricing_reviewed, brand_name)
    // plus booster_availability, which migration 0009 seeds.
    expect(
      await count({ kind: "user", userId: ALICE }, "select key from public.site_settings"),
    ).toBe(3);
    expect(await count({ kind: "anon" }, "select key from public.site_settings")).toBe(3);
  });

  it("an authenticated ADMIN cannot UPDATE or INSERT — the trap the settings actions exist for", async () => {
    // site_settings_write_admin (FOR ALL, is_admin) would pass; the grant
    // stops PostgREST first. settings/actions.ts must stay service-role.
    await expect(
      asActor(db, { kind: "user", userId: ADMIN }, async () => {
        await db.query(
          `update public.site_settings set value = 'true'::jsonb where key = 'pricing_reviewed'`,
        );
      }),
    ).rejects.toThrow(/permission denied/);

    await expect(
      asActor(db, { kind: "user", userId: ADMIN }, async () => {
        await db.query(`insert into public.site_settings (key, value) values ('x', '1'::jsonb)`);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("the service role flips pricing_reviewed (the launch gate write path)", async () => {
    await asActor(db, { kind: "service" }, async () => {
      await db.query(
        `insert into public.site_settings (key, value) values ('pricing_reviewed', 'true'::jsonb)
         on conflict (key) do update set value = excluded.value`,
      );
    });
    const value = await asActor(db, { kind: "service" }, async () => {
      const r = await db.query<{ v: string }>(
        `select value::text as v from public.site_settings where key = 'pricing_reviewed'`,
      );
      return r.rows[0]!.v;
    });
    expect(value).toBe("true");
  });
});

describe("booster_profiles: promotion is service-role only; boosters self-manage availability", () => {
  it("an authenticated ADMIN cannot INSERT a booster profile (no INSERT grant)", async () => {
    await expect(
      asActor(db, { kind: "user", userId: ADMIN }, async () => {
        await db.query(`insert into public.booster_profiles (id) values ($1)`, [CANDIDATE]);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("the service role promotes: role flip passes the guard trigger + booster row insert", async () => {
    await asActor(db, { kind: "service" }, async () => {
      // profiles_guard_role only raises for current_user = 'authenticated';
      // server contexts (service role, migrations) are trusted.
      await db.query(`update public.profiles set role = 'booster' where id = $1`, [CANDIDATE]);
      await db.query(`insert into public.booster_profiles (id) values ($1)`, [CANDIDATE]);
    });
    const role = await asActor(db, { kind: "service" }, async () => {
      const r = await db.query<{ role: string }>(
        `select role::text from public.profiles where id = $1`,
        [CANDIDATE],
      );
      return r.rows[0]!.role;
    });
    expect(role).toBe("booster");
  });

  it("a booster updates their own availability through RLS (the one self-serve write)", async () => {
    const updated = await asActor(db, { kind: "user", userId: BOOSTER }, async () => {
      const r = await db.query<{ id: string }>(
        `update public.booster_profiles set is_accepting = false where id = $1 returning id`,
        [BOOSTER],
      );
      return r.rows.length;
    });
    expect(updated).toBe(1);
  });

  it("strangers see nothing and match zero rows on update; admins can read the roster", async () => {
    expect(
      await count({ kind: "user", userId: ALICE }, "select id from public.booster_profiles"),
    ).toBe(0);
    const updated = await asActor(db, { kind: "user", userId: ALICE }, async () => {
      const r = await db.query<{ id: string }>(
        `update public.booster_profiles set is_accepting = false returning id`,
      );
      return r.rows.length;
    });
    expect(updated).toBe(0);
    expect(
      await count({ kind: "user", userId: ADMIN }, "select id from public.booster_profiles"),
    ).toBe(2);
  });
});

describe("audit_log: writes are service-only, reads are admin-only", () => {
  it("an authenticated ADMIN cannot INSERT audit rows (no write grant — tamper-proofing)", async () => {
    await expect(
      asActor(db, { kind: "user", userId: ADMIN }, async () => {
        await db.query(
          `insert into public.audit_log (actor_id, action) values ($1, 'settings.updated')`,
          [ADMIN],
        );
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("the service role writes; admins read; customers see zero rows", async () => {
    await asActor(db, { kind: "service" }, async () => {
      await db.query(
        `insert into public.audit_log (actor_id, action, entity, entity_id)
         values ($1, 'settings.updated', 'site_settings', 'pricing_reviewed')`,
        [ADMIN],
      );
    });
    expect(await count({ kind: "user", userId: ADMIN }, "select id from public.audit_log")).toBe(1);
    expect(await count({ kind: "user", userId: ALICE }, "select id from public.audit_log")).toBe(0);
  });
});

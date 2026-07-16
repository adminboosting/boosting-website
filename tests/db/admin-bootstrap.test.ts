import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { shouldBootstrap } from "@/lib/auth/bootstrap-core";
import { asActor, bootstrapDb, seedUser } from "./helpers/bootstrap";

/**
 * Admin bootstrap on real Postgres (PGlite): the promotion UPDATE that
 * lib/auth/bootstrap.ts#maybeBootstrapAdmin issues through the service-role
 * client (`set role='admin' where id = ? and role = 'customer'`) works, is
 * idempotent, and is impossible for the session client — profiles_guard_role
 * raises for any role change made while current_user = 'authenticated'.
 * The email match itself is the pure shouldBootstrap core (bootstrap-core.ts),
 * exercised here against the seeded emails the way the app would.
 */
const FOUNDER = "eeeeeeee-0000-0000-0000-000000000001";
const MALLORY = "ffffffff-0000-0000-0000-000000000002";
const FOUNDER_EMAIL = "Owner@RankedFrogs.test"; // case differs from the env value on purpose
const BOOTSTRAP_EMAIL = "owner@rankedfrogs.test";

let db: PGlite;

/** The exact promotion statement maybeBootstrapAdmin runs via createAdminClient(). */
async function promoteAsService(userId: string): Promise<number> {
  return asActor(db, { kind: "service" }, async () => {
    const r = await db.query<{ id: string }>(
      `update public.profiles set role = 'admin' where id = $1 and role = 'customer' returning id`,
      [userId],
    );
    return r.rows.length;
  });
}

async function roleOf(userId: string): Promise<string> {
  const r = await db.query<{ role: string }>(
    `select role::text from public.profiles where id = $1`,
    [userId],
  );
  return r.rows[0]!.role;
}

beforeAll(async () => {
  db = await bootstrapDb();
  await seedUser(db, { id: FOUNDER, email: FOUNDER_EMAIL });
  await seedUser(db, { id: MALLORY, email: "mallory@example.test" });
});

afterAll(async () => {
  await db?.close();
});

describe("bootstrap email matching (pure core, against seeded users)", () => {
  it("matches the founder case-insensitively and rejects everyone else", () => {
    expect(shouldBootstrap(FOUNDER_EMAIL, BOOTSTRAP_EMAIL)).toBe(true);
    expect(shouldBootstrap("mallory@example.test", BOOTSTRAP_EMAIL)).toBe(false);
    expect(shouldBootstrap(FOUNDER_EMAIL, undefined)).toBe(false); // feature off, never "promote anyone"
  });
});

describe("service-role promotion", () => {
  it("promotes the matching user to admin, passing the guard trigger", async () => {
    expect(await roleOf(FOUNDER)).toBe("customer"); // handle_new_user default
    expect(await promoteAsService(FOUNDER)).toBe(1);
    expect(await roleOf(FOUNDER)).toBe("admin");
  });

  it("is idempotent: a second run matches zero rows and changes nothing", async () => {
    expect(await promoteAsService(FOUNDER)).toBe(0);
    expect(await roleOf(FOUNDER)).toBe("admin");
  });

  it("leaves users with a different email untouched (app never issues their UPDATE)", async () => {
    // shouldBootstrap gates the call, so no UPDATE ever targets Mallory.
    expect(await roleOf(MALLORY)).toBe("customer");
  });
});

describe("session-client self-promotion stays impossible", () => {
  it("the guard trigger raises for role changes as an authenticated user", async () => {
    await expect(
      asActor(db, { kind: "user", userId: MALLORY }, async () => {
        await db.query(`update public.profiles set role = 'admin' where id = $1`, [MALLORY]);
      }),
    ).rejects.toThrow(/only admins may change a profile role/);
    expect(await roleOf(MALLORY)).toBe("customer");
  });
});

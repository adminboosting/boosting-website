/**
 * Brings a fresh PGlite database to the state a real Supabase project would be
 * in after our migrations: the Supabase shim (roles + auth), then every file in
 * supabase/migrations/ applied via the real runner. Used by the migration, RLS,
 * and price-parity tests.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "@/scripts/lib/migrate-core";
import { loadMigrationFiles } from "@/scripts/lib/migrate-io";
import { freshDb, migrationClientFor } from "./pglite";

const SHIM_SQL = readFileSync(
  join(process.cwd(), "tests", "db", "helpers", "supabase-shim.sql"),
  "utf8",
);

export const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** Fresh DB with the shim applied and all migrations run from clean. */
export async function bootstrapDb(): Promise<PGlite> {
  const db = freshDb();
  await db.exec(SHIM_SQL);
  await applyMigrations(migrationClientFor(db), loadMigrationFiles(MIGRATIONS_DIR));
  return db;
}

/**
 * Insert a user (auth.users row fires the profile-creation trigger) and set its
 * app role. Runs as the default PGlite superuser, which bypasses RLS — this is
 * test setup, not an assertion.
 */
export async function seedUser(
  db: PGlite,
  opts: { id: string; role?: "customer" | "booster" | "admin"; email?: string },
): Promise<string> {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [
    opts.id,
    opts.email ?? `${opts.id}@example.test`,
  ]);
  if (opts.role && opts.role !== "customer") {
    await db.query(`update public.profiles set role = $2 where id = $1`, [opts.id, opts.role]);
  }
  return opts.id;
}

export type Actor = { kind: "anon" } | { kind: "service" } | { kind: "user"; userId: string };

/**
 * Run `fn` inside a transaction as the given actor — the Supabase pattern:
 * `set local role` + a transaction-scoped `request.jwt.claims`. RLS is enforced
 * for `anon`/`user`; `service` bypasses it (service_role has bypassrls).
 */
export async function asActor<T>(db: PGlite, actor: Actor, fn: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    if (actor.kind === "service") {
      await db.exec("set local role service_role");
    } else if (actor.kind === "user") {
      await db.exec("set local role authenticated");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: actor.userId, role: "authenticated" }),
      ]);
    } else {
      await db.exec("set local role anon");
    }
    const result = await fn();
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

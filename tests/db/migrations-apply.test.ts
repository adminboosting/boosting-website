import { afterEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "@/scripts/lib/migrate-core";
import { loadMigrationFiles } from "@/scripts/lib/migrate-io";
import { MIGRATIONS_DIR, bootstrapDb } from "./helpers/bootstrap";
import { migrationClientFor } from "./helpers/pglite";

/** Gate B: the real migrations apply reproducibly from clean, and re-running is a no-op. */
describe("migrations apply from clean", () => {
  let db: PGlite;
  afterEach(async () => {
    await db?.close();
  });

  it("applies every supabase/migrations file with no error", async () => {
    db = await bootstrapDb();
    const tables = await db.query<{ c: number }>(
      "select count(*)::int as c from information_schema.tables where table_schema = 'public'",
    );
    // The ~28-table model — assert a healthy floor so a dropped migration is caught.
    expect(tables.rows[0]!.c).toBeGreaterThanOrEqual(25);
  });

  it("enables RLS on every public table", async () => {
    db = await bootstrapDb();
    const noRls = await db.query<{ tablename: string }>(
      `select tablename from pg_tables
       where schemaname = 'public' and rowsecurity = false
         and tablename <> '_schema_migrations'`,
    );
    expect(noRls.rows.map((r) => r.tablename)).toEqual([]);
  });

  it("is idempotent — a second run applies nothing", async () => {
    db = await bootstrapDb();
    const res = await applyMigrations(migrationClientFor(db), loadMigrationFiles(MIGRATIONS_DIR));
    expect(res.applied).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type MigrationFile } from "@/scripts/lib/migrate-core";
import { freshDb, migrationClientFor } from "./helpers/pglite";

/**
 * Exercises the migration runner core against real Postgres (PGlite) — proving
 * ordering, idempotency, and transactional rollback WITHOUT a live database.
 * This is the mechanism behind Gate B's "migrations apply reproducibly from clean".
 */
describe("migration runner core", () => {
  let db: PGlite;

  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await db.close();
  });

  it("applies migrations in filename order, even if passed out of order", async () => {
    const client = migrationClientFor(db);
    const migrations: MigrationFile[] = [
      { name: "0002_add_column.sql", sql: "alter table widgets add column label text;" },
      { name: "0001_init.sql", sql: "create table widgets (id int primary key);" },
    ];

    const result = await applyMigrations(client, migrations);

    expect(result.applied).toEqual(["0001_init.sql", "0002_add_column.sql"]);
    expect(result.skipped).toEqual([]);
    // The column added by 0002 exists -> order was respected.
    const cols = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'widgets' order by column_name",
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual(["id", "label"]);
  });

  it("is idempotent: re-running applies nothing new", async () => {
    const client = migrationClientFor(db);
    const migrations: MigrationFile[] = [
      { name: "0001_init.sql", sql: "create table widgets (id int primary key);" },
    ];

    const first = await applyMigrations(client, migrations);
    expect(first.applied).toEqual(["0001_init.sql"]);

    const second = await applyMigrations(client, migrations);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(["0001_init.sql"]);

    const tracked = await db.query<{ count: string }>(
      "select count(*)::text as count from _schema_migrations",
    );
    expect(tracked.rows[0]?.count).toBe("1");
  });

  it("rolls back a failing migration atomically and records nothing", async () => {
    const client = migrationClientFor(db);
    const migrations: MigrationFile[] = [
      {
        name: "0001_bad.sql",
        // First statement succeeds, second fails -> the whole migration must roll back.
        sql: "create table partial_rollback (id int); insert into does_not_exist values (1);",
      },
    ];

    await expect(applyMigrations(client, migrations)).rejects.toThrow(/0001_bad\.sql failed/);

    // The successful first statement must have been rolled back.
    const exists = await db.query<{ exists: boolean }>(
      "select to_regclass('public.partial_rollback') is not null as exists",
    );
    expect(exists.rows[0]?.exists).toBe(false);

    // Nothing recorded as applied.
    const tracked = await db.query<{ count: string }>(
      "select count(*)::text as count from _schema_migrations",
    );
    expect(tracked.rows[0]?.count).toBe("0");
  });
});

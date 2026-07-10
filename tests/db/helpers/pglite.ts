/**
 * Shared PGlite helpers for the database integration tests (no Docker, no live
 * DB — Postgres 18 compiled to WASM, in-process). Phase B's RLS isolation tests
 * build on these.
 */
import { PGlite } from "@electric-sql/pglite";
import type { MigrationClient } from "@/scripts/lib/migrate-core";

/** Adapt a PGlite instance to the runner's MigrationClient interface. */
export function migrationClientFor(db: PGlite): MigrationClient {
  return {
    exec: async (sql: string) => {
      await db.exec(sql);
    },
    query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
      const result = await db.query<T>(sql, params as unknown[] | undefined);
      return { rows: result.rows };
    },
  };
}

/** A fresh in-memory PGlite database for one test. */
export function freshDb(): PGlite {
  return new PGlite();
}

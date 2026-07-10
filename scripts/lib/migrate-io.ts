/**
 * Filesystem side of the migration runner (Node-only). Kept separate from
 * `migrate-core.ts` so the core stays pure and testable against PGlite.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { MigrationFile } from "./migrate-core";

/** Load `*.sql` files from a directory as MigrationFile[], sorted by name. */
export function loadMigrationFiles(dir: string): MigrationFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
}

/** Read a single SQL file (e.g. seed.sql) if it exists, else null. */
export function readSqlFile(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

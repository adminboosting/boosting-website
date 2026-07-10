/**
 * Reproducible, forward-only migration runner core (spec A4).
 *
 * DB-agnostic on purpose: it talks to a minimal `MigrationClient` interface, so
 * the SAME logic drives both the real Postgres/Supabase runner (`scripts/migrate.ts`,
 * via node-postgres) and the in-process PGlite instance used by the migration and
 * RLS integration tests. That means the runner itself is exercised in CI without
 * a live database, and Gate B's "migrations apply reproducibly from clean" is a
 * test, not a hope.
 *
 * Rules:
 *  - Migrations are applied in ascending filename order.
 *  - Each migration runs inside its own transaction; a failure rolls back and
 *    aborts (nothing partial is recorded).
 *  - Applied migrations are recorded in `_schema_migrations`; re-running is a
 *    no-op for already-applied files (idempotent).
 *  - Forward-only: there are no "down" migrations. To change schema, add a new
 *    migration. Seeds are separate (`scripts/seed.ts`) and idempotent.
 */

export interface MigrationClient {
  /** Run one or more statements with no bound parameters (simple protocol). */
  exec(sql: string): Promise<void>;
  /** Run a single parameterized statement and return its rows. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface MigrationFile {
  /** Filename, e.g. "0001_init.sql". Used as the sort key and tracking id. */
  name: string;
  sql: string;
}

export interface ApplyResult {
  applied: string[];
  skipped: string[];
}

export const TRACKING_TABLE = "_schema_migrations";

function byName(a: MigrationFile, b: MigrationFile): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

export async function applyMigrations(
  client: MigrationClient,
  migrations: MigrationFile[],
  options: { logger?: (message: string) => void } = {},
): Promise<ApplyResult> {
  const log = options.logger ?? (() => {});

  await client.exec(
    `create table if not exists ${TRACKING_TABLE} (
       name text primary key,
       applied_at timestamptz not null default now()
     )`,
  );

  const doneRows = await client.query<{ name: string }>(`select name from ${TRACKING_TABLE}`);
  const done = new Set(doneRows.rows.map((r) => r.name));

  const ordered = [...migrations].sort(byName);
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of ordered) {
    if (done.has(migration.name)) {
      skipped.push(migration.name);
      continue;
    }

    log(`→ applying ${migration.name}`);
    await client.exec("begin");
    try {
      await client.exec(migration.sql);
      await client.query(`insert into ${TRACKING_TABLE} (name) values ($1)`, [migration.name]);
      await client.exec("commit");
    } catch (error) {
      await client.exec("rollback");
      throw new Error(
        `Migration ${migration.name} failed and was rolled back: ${(error as Error).message}`,
        { cause: error },
      );
    }
    applied.push(migration.name);
    log(`✓ applied ${migration.name}`);
  }

  return { applied, skipped };
}

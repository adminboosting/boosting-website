/**
 * Applies `supabase/migrations/*.sql` to the database at SUPABASE_DB_URL
 * (or DATABASE_URL), in order, recording each in `_schema_migrations`.
 *
 * Usage:
 *   SUPABASE_DB_URL=postgres://... pnpm db:migrate
 *
 * Forward-only and idempotent — safe to re-run. See RUNBOOK.md for how the
 * non-technical owner gets the connection string from Supabase, and DECISIONS.md
 * for why this node-postgres runner is used instead of the Supabase CLI.
 */
import { join } from "node:path";
import { Client } from "pg";
import { applyMigrations, type MigrationClient } from "./lib/migrate-core";
import { loadMigrationFiles } from "./lib/migrate-io";

function isLocal(url: string): boolean {
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
}

async function main() {
  const url = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "✗ No database URL. Set SUPABASE_DB_URL (Supabase → Settings → Database →\n" +
        "  Connection string) or DATABASE_URL, then re-run `pnpm db:migrate`.",
    );
    process.exit(1);
  }

  const files = loadMigrationFiles(join(process.cwd(), "supabase", "migrations"));
  if (files.length === 0) {
    console.log("No migrations found in supabase/migrations — nothing to apply.");
    return;
  }

  // Hosted Supabase requires TLS; local Postgres does not.
  const client = new Client({
    connectionString: url,
    ssl: isLocal(url) ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();

  const migrationClient: MigrationClient = {
    exec: async (sql) => {
      await client.query(sql);
    },
    query: async (sql, params) => {
      const result = await client.query(sql, params as unknown[] | undefined);
      return { rows: result.rows };
    },
  };

  try {
    const { applied, skipped } = await applyMigrations(migrationClient, files, {
      logger: (m) => console.log(m),
    });
    console.log(
      `\n✓ Migrations complete. Applied ${applied.length}, already-applied ${skipped.length}.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("✗ Migration run failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

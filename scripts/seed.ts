/**
 * Applies `supabase/seed.sql` to the database at SUPABASE_DB_URL (or DATABASE_URL).
 *
 * Usage:
 *   SUPABASE_DB_URL=postgres://... pnpm db:seed
 *
 * Seeds are SEPARATE from migrations and MUST be idempotent (the seed file uses
 * upserts / `on conflict do update`), so re-running never duplicates rows. The
 * seed is generated from the in-code catalog so prices are defined in one place
 * (spec B1). This is not tracked in `_schema_migrations` — it is meant to be
 * re-runnable whenever the catalog changes.
 */
import { join } from "node:path";
import { Client } from "pg";
import { readSqlFile } from "./lib/migrate-io";

function isLocal(url: string): boolean {
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
}

async function main() {
  const url = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "✗ No database URL. Set SUPABASE_DB_URL or DATABASE_URL, then re-run `pnpm db:seed`.",
    );
    process.exit(1);
  }

  const sql = readSqlFile(join(process.cwd(), "supabase", "seed.sql"));
  if (sql === null) {
    console.log("No supabase/seed.sql found — nothing to seed.");
    return;
  }

  const client = new Client({
    connectionString: url,
    ssl: isLocal(url) ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log("✓ Seed applied (idempotent).");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("✗ Seed run failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

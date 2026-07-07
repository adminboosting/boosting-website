/**
 * CI guard (§2): asserts that no server-only secret VALUE leaks into the client
 * build output. Run AFTER `pnpm build` with the real secret env vars present
 * (as they are in CI). Locally, with only dummy/unset secrets, it scans and
 * passes trivially.
 *
 * Usage: pnpm check:secrets
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CLIENT_OUTPUT_DIR = join(process.cwd(), ".next", "static");

// Env vars whose values must never appear in the client bundle.
const SECRET_ENV_VARS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "CREDENTIAL_MASTER_KEY",
  "ANTHROPIC_API_KEY",
  "SUPABASE_DB_URL",
  "NOWPAYMENTS_API_KEY",
  "NOWPAYMENTS_IPN_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "CRON_SECRET",
  "SENTRY_AUTH_TOKEN",
];

// Obvious placeholder values that are not real secrets and should be ignored.
const DUMMY_VALUES = new Set([
  "your-service-role-key",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  "change-me-to-a-long-random-string",
]);

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function main(): void {
  if (!existsSync(CLIENT_OUTPUT_DIR)) {
    console.error(`✗ ${CLIENT_OUTPUT_DIR} not found. Run \`pnpm build\` first.`);
    process.exit(1);
  }

  const secrets = SECRET_ENV_VARS.map((name) => ({ name, value: process.env[name] }))
    .filter((s): s is { name: string; value: string } => typeof s.value === "string")
    .filter((s) => s.value.length >= 12 && !DUMMY_VALUES.has(s.value));

  const files = collectFiles(CLIENT_OUTPUT_DIR);
  const leaks: Array<{ file: string; name: string }> = [];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const { name, value } of secrets) {
      if (content.includes(value)) {
        leaks.push({ file: file.replace(process.cwd() + "/", ""), name });
      }
    }
  }

  if (leaks.length > 0) {
    console.error("✗ SERVER SECRETS LEAKED INTO CLIENT BUNDLE:");
    for (const leak of leaks) {
      console.error(`  - ${leak.name} found in ${leak.file}`);
    }
    process.exit(1);
  }

  console.log(
    `✓ No server secrets in client bundle (${files.length} files scanned, ${secrets.length} real secret value(s) checked).`,
  );
}

main();

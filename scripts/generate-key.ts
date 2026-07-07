/**
 * Generates a fresh 32-byte AES-256 master key for the credential vault (§10),
 * base64-encoded. Run with: pnpm generate:key
 *
 * Copy the printed value into CREDENTIAL_MASTER_KEY in .env.local (dev) or the
 * Vercel dashboard (prod). NEVER commit a real key.
 */
import { randomBytes } from "node:crypto";

const key = randomBytes(32).toString("base64");

process.stdout.write(
  [
    "",
    "Generated CREDENTIAL_MASTER_KEY (32 random bytes, base64):",
    "",
    `  ${key}`,
    "",
    "Add it to your environment (do NOT commit):",
    "",
    `  CREDENTIAL_MASTER_KEY=${key}`,
    "",
  ].join("\n") + "\n",
);

/**
 * Credential vault: AES-256-GCM for piloted-account logins (§10). The DB table
 * order_credentials stores only the base64 envelope produced here — plaintext
 * exists solely inside these call frames and is never logged or persisted.
 *
 * Pure node:crypto on purpose: no "server-only" and no Supabase imports, so the
 * hermetic fast suite can exercise it directly. Callers decide what the
 * plaintext is (store.ts uses JSON.stringify({ username, password, note? })).
 *
 * Key: CREDENTIAL_MASTER_KEY, base64 of exactly 32 bytes (pnpm generate:key).
 * Rotation is intentionally out of scope for Phase 2 — single key, decrypt
 * happens only in service-role server code.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** The only algorithm the vault speaks; matches the order_credentials.algo default. */
export const VAULT_ALGO = "aes-256-gcm" as const;

/** GCM standard 96-bit IV; fresh random bytes per encryption, never reused. */
const IV_BYTES = 12;
/** AES-256 key length after base64 decoding. */
const KEY_BYTES = 32;

/**
 * Encrypted envelope, base64 throughout. Fields map 1:1 onto the
 * order_credentials columns (ciphertext / iv / auth_tag / algo) — the row is
 * built as `{ order_id, ciphertext, iv, auth_tag: authTag, algo }`.
 */
export interface CredentialEnvelope {
  ciphertext: string;
  iv: string;
  authTag: string;
  algo: typeof VAULT_ALGO;
}

/**
 * Read and decode CREDENTIAL_MASTER_KEY. Throws a descriptive error when the
 * variable is missing or does not decode to exactly 32 bytes — callers that
 * must degrade gracefully gate on isVaultConfigured() first.
 */
export function getMasterKey(): Buffer {
  const raw = process.env.CREDENTIAL_MASTER_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIAL_MASTER_KEY is not set. Generate one with `pnpm generate:key` and add it to the environment.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CREDENTIAL_MASTER_KEY must be base64 of exactly ${KEY_BYTES} bytes, got ${key.length}. Generate one with \`pnpm generate:key\`.`,
    );
  }
  return key;
}

/** True when CREDENTIAL_MASTER_KEY is present and decodes to a valid AES-256 key. */
export function isVaultConfigured(): boolean {
  const raw = process.env.CREDENTIAL_MASTER_KEY;
  if (!raw) return false;
  return Buffer.from(raw, "base64").length === KEY_BYTES;
}

/**
 * Encrypt a plaintext payload under the master key with a fresh random IV.
 * Returns the base64 envelope destined for order_credentials.
 */
export function encryptCredentials(plaintext: string): CredentialEnvelope {
  const key = getMasterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(VAULT_ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    algo: VAULT_ALGO,
  };
}

/**
 * Decrypt an envelope back to the plaintext payload. GCM authenticates before
 * releasing plaintext: any tampering with ciphertext, IV, or auth tag throws
 * (never returns corrupted plaintext).
 */
export function decryptCredentials(
  envelope: Pick<CredentialEnvelope, "ciphertext" | "iv" | "authTag">,
): string {
  const key = getMasterKey();
  const decipher = createDecipheriv(VAULT_ALGO, key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

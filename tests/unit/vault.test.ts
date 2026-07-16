import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptCredentials,
  encryptCredentials,
  getMasterKey,
  isVaultConfigured,
  VAULT_ALGO,
} from "@/lib/credentials/vault";

/** Deterministic valid key: 32 bytes of 0x07, base64-encoded. */
const VALID_KEY = Buffer.alloc(32, 7).toString("base64");

/** Flip one bit in a base64 string's first decoded byte (GCM must reject it). */
function tamper(b64: string): string {
  const bytes = Buffer.from(b64, "base64");
  bytes.writeUInt8(bytes.readUInt8(0) ^ 0x01, 0);
  return bytes.toString("base64");
}

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getMasterKey / isVaultConfigured", () => {
  it("throws a descriptive error when CREDENTIAL_MASTER_KEY is missing", () => {
    vi.stubEnv("CREDENTIAL_MASTER_KEY", undefined);
    expect(() => getMasterKey()).toThrow(/CREDENTIAL_MASTER_KEY is not set/);
    expect(isVaultConfigured()).toBe(false);
  });

  it("throws when the key decodes to the wrong length", () => {
    vi.stubEnv("CREDENTIAL_MASTER_KEY", Buffer.alloc(16, 1).toString("base64"));
    expect(() => getMasterKey()).toThrow(/exactly 32 bytes, got 16/);
    expect(isVaultConfigured()).toBe(false);

    vi.stubEnv("CREDENTIAL_MASTER_KEY", Buffer.alloc(33, 1).toString("base64"));
    expect(() => getMasterKey()).toThrow(/exactly 32 bytes, got 33/);
    expect(isVaultConfigured()).toBe(false);
  });

  it("returns the decoded 32-byte key and reports configured", () => {
    vi.stubEnv("CREDENTIAL_MASTER_KEY", VALID_KEY);
    expect(getMasterKey()).toEqual(Buffer.alloc(32, 7));
    expect(isVaultConfigured()).toBe(true);
  });
});

describe("encryptCredentials / decryptCredentials", () => {
  const payload = JSON.stringify({ username: "frog#1234", password: "s3cret!", note: "EUW" });

  it("roundtrips plaintext through the base64 envelope", () => {
    vi.stubEnv("CREDENTIAL_MASTER_KEY", VALID_KEY);
    const envelope = encryptCredentials(payload);
    expect(decryptCredentials(envelope)).toBe(payload);
  });

  it("emits base64 fields and the aes-256-gcm algo marker", () => {
    vi.stubEnv("CREDENTIAL_MASTER_KEY", VALID_KEY);
    const envelope = encryptCredentials(payload);
    expect(envelope.algo).toBe(VAULT_ALGO);
    expect(envelope.ciphertext).toMatch(BASE64_RE);
    expect(envelope.iv).toMatch(BASE64_RE);
    expect(envelope.authTag).toMatch(BASE64_RE);
    // 12-byte GCM IV and 16-byte auth tag after decoding.
    expect(Buffer.from(envelope.iv, "base64")).toHaveLength(12);
    expect(Buffer.from(envelope.authTag, "base64")).toHaveLength(16);
  });

  it("uses a fresh random IV per call (same plaintext, different envelope)", () => {
    vi.stubEnv("CREDENTIAL_MASTER_KEY", VALID_KEY);
    const first = encryptCredentials(payload);
    const second = encryptCredentials(payload);
    expect(second.iv).not.toBe(first.iv);
    expect(second.ciphertext).not.toBe(first.ciphertext);
  });

  it("throws on a tampered ciphertext or auth tag instead of returning garbage", () => {
    vi.stubEnv("CREDENTIAL_MASTER_KEY", VALID_KEY);
    const envelope = encryptCredentials(payload);
    expect(() =>
      decryptCredentials({ ...envelope, ciphertext: tamper(envelope.ciphertext) }),
    ).toThrow();
    expect(() => decryptCredentials({ ...envelope, authTag: tamper(envelope.authTag) })).toThrow();
  });

  it("throws when encrypting or decrypting without a configured key", () => {
    vi.stubEnv("CREDENTIAL_MASTER_KEY", VALID_KEY);
    const envelope = encryptCredentials(payload);

    vi.stubEnv("CREDENTIAL_MASTER_KEY", undefined);
    expect(() => encryptCredentials(payload)).toThrow(/CREDENTIAL_MASTER_KEY is not set/);
    expect(() => decryptCredentials(envelope)).toThrow(/CREDENTIAL_MASTER_KEY is not set/);
  });

  it("fails to decrypt under a different (wrong) key", () => {
    vi.stubEnv("CREDENTIAL_MASTER_KEY", VALID_KEY);
    const envelope = encryptCredentials(payload);

    vi.stubEnv("CREDENTIAL_MASTER_KEY", Buffer.alloc(32, 9).toString("base64"));
    expect(() => decryptCredentials(envelope)).toThrow();
  });
});

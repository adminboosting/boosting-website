import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * Field names that must never leave the server. Game-account credentials are
 * radioactive (spec §10): they must never appear in logs or Sentry.
 */
const SENSITIVE_KEY_PATTERN =
  /(login|password|credential|credentials|nonce|ciphertext|master_key|secret|token|authorization|cookie|api[_-]?key)/i;

const REDACTED = "[REDACTED]";

/** Recursively redact values under any sensitive-looking key. */
function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactDeep(val, depth + 1);
  }
  return out;
}

/**
 * Sentry `beforeSend` hook. Strips credential fields from every event and drops
 * the request body entirely for the credential submission/reveal routes.
 */
export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (event.request) {
    const url = event.request.url ?? "";
    if (url.includes("/credentials")) {
      event.request.data = REDACTED;
    } else if (event.request.data) {
      event.request.data = redactDeep(event.request.data);
    }
    // Cookies and headers can carry session tokens — drop/redact them entirely.
    delete event.request.cookies;
    if (event.request.headers) {
      event.request.headers = redactDeep(event.request.headers) as Record<string, string>;
    }
  }

  if (event.extra) event.extra = redactDeep(event.extra) as Record<string, unknown>;
  if (event.contexts) {
    event.contexts = redactDeep(event.contexts) as NonNullable<ErrorEvent["contexts"]>;
  }

  return event;
}

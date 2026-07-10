/**
 * Deterministic key-case mapping between Postgres snake_case rows and the app's
 * camelCase objects (spec A7). One tested mapper, used by the Phase B DB catalog
 * source and the order data layer — so case conversion lives in exactly one
 * place instead of being hand-written per query.
 *
 * The `config` jsonb column is special: the client payload, the pricing engine,
 * and the stored jsonb all share ONE camelCase shape (see DECISIONS — spec §6
 * showed snake_case only illustratively). So any key listed in `preserveValueOf`
 * is copied verbatim, without recursing into it, in BOTH directions. That keeps
 * `orders.config` camelCase end to end.
 */

/** Recursively-transformable JSON-ish value. */
type Transformable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | Transformable[]
  | { [key: string]: Transformable };

export interface KeyMapOptions {
  /**
   * Keys whose VALUE is copied verbatim (no key/value recursion), matched
   * against the original key name. Case-insensitive to snake/camel because these
   * names (e.g. "config") are identical in both forms. Defaults to `["config"]`.
   */
  preserveValueOf?: string[];
}

const DEFAULT_PRESERVE = ["config"];

export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)
  );
}

function mapKeysDeep(
  input: unknown,
  transformKey: (key: string) => string,
  preserve: Set<string>,
): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => mapKeysDeep(item, transformKey, preserve));
  }
  if (isPlainObject(input)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      const nextKey = transformKey(key);
      // Preserve the value verbatim for jsonb-style columns (e.g. `config`).
      out[nextKey] = preserve.has(key) ? value : mapKeysDeep(value, transformKey, preserve);
    }
    return out;
  }
  // Primitives, null/undefined, and Date pass through untouched.
  return input;
}

/** DB row (snake_case) -> app object (camelCase). */
export function keysToCamel<T = unknown>(input: Transformable, options: KeyMapOptions = {}): T {
  const preserve = new Set(options.preserveValueOf ?? DEFAULT_PRESERVE);
  return mapKeysDeep(input, snakeToCamel, preserve) as T;
}

/** App object (camelCase) -> DB row (snake_case). */
export function keysToSnake<T = unknown>(input: Transformable, options: KeyMapOptions = {}): T {
  const preserve = new Set(options.preserveValueOf ?? DEFAULT_PRESERVE);
  return mapKeysDeep(input, camelToSnake, preserve) as T;
}

/** Convenience: read a DB row into an app object, keeping `config` camelCase. */
export function rowToObject<T = unknown>(row: Record<string, unknown>): T {
  return keysToCamel<T>(row as Transformable);
}

/** Convenience: serialize an app object to a DB row, keeping `config` camelCase. */
export function objectToRow(object: Record<string, unknown>): Record<string, unknown> {
  return keysToSnake<Record<string, unknown>>(object as Transformable);
}

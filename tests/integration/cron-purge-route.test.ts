import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/purge-credentials/route";

/**
 * Hermetic contract for the cron purge route. The fast-suite config blanks
 * NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY; the stubs below pin
 * that locally so the 503 path is exercised regardless of the host env. The
 * "server-only" modules behind the config gate must never be evaluated here —
 * a throw on the authorized-but-unconfigured path would fail these tests.
 */

const SECRET = "test-cron-secret";

function get(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/purge-credentials", { headers });
}

function stubBlankSupabaseEnv(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/purge-credentials", () => {
  it("returns 401 when CRON_SECRET is unset, even with a bearer header", async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    const res = await GET(get({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized." });
  });

  it("returns 401 when the Authorization header is missing", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await GET(get());
    expect(res.status).toBe(401);
  });

  it("returns 401 for a wrong bearer token", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await GET(get({ authorization: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized." });
  });

  it("returns 503 (not a throw) with the correct bearer when Supabase env is blank", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    stubBlankSupabaseEnv();
    const res = await GET(get({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Not configured." });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

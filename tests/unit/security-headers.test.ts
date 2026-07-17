import { describe, expect, it } from "vitest";
import nextConfig, { buildContentSecurityPolicy, buildSecurityHeaders } from "@/next.config";

/** Pull one directive's value list out of a serialized CSP. */
function directive(csp: string, name: string): string {
  const match = csp.split("; ").find((d) => d === name || d.startsWith(`${name} `));
  expect(match, `directive ${name} present`).toBeDefined();
  return match as string;
}

describe("buildContentSecurityPolicy", () => {
  it("derives the Supabase https origin AND its wss:// twin into connect-src", () => {
    // The wss:// entry is the one that keeps order-chat realtime alive — a
    // https: source never authorizes websockets in CSP.
    const csp = buildContentSecurityPolicy({ supabaseUrl: "https://abcd1234.supabase.co" });
    const connect = directive(csp, "connect-src");
    expect(connect).toContain("https://abcd1234.supabase.co");
    expect(connect).toContain("wss://abcd1234.supabase.co");
    expect(connect).toContain("'self'");
    expect(connect).toContain("https://vitals.vercel-insights.com");
  });

  it("reduces a Supabase URL with a path/trailing slash to its origin", () => {
    const csp = buildContentSecurityPolicy({ supabaseUrl: "https://abcd1234.supabase.co/" });
    const connect = directive(csp, "connect-src");
    expect(connect).toContain("wss://abcd1234.supabase.co");
    expect(connect).not.toContain("supabase.co/");
  });

  it("falls back to the wildcard https+wss pair when the env URL is missing or junk", () => {
    for (const supabaseUrl of [undefined, "", "not a url"]) {
      const connect = directive(buildContentSecurityPolicy({ supabaseUrl }), "connect-src");
      expect(connect, `supabaseUrl=${String(supabaseUrl)}`).toContain("https://*.supabase.co");
      expect(connect, `supabaseUrl=${String(supabaseUrl)}`).toContain("wss://*.supabase.co");
    }
  });

  it("never ships 'unsafe-eval' in prod mode, but allows it in dev (React Refresh)", () => {
    const prod = buildContentSecurityPolicy({ dev: false });
    expect(prod).not.toContain("'unsafe-eval'");
    // Default is prod-safe too.
    expect(buildContentSecurityPolicy()).not.toContain("'unsafe-eval'");

    const dev = buildContentSecurityPolicy({ dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
  });

  it("locks down framing, base, forms, objects and upgrades insecure requests", () => {
    const csp = buildContentSecurityPolicy();
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "worker-src")).toBe("worker-src 'self' blob:");
    expect(csp.split("; ")).toContain("upgrade-insecure-requests");
  });

  it("keeps 'unsafe-inline' for Next inline scripts + Tailwind styles (no-nonce decision)", () => {
    const csp = buildContentSecurityPolicy();
    expect(directive(csp, "script-src")).toContain("'unsafe-inline'");
    expect(directive(csp, "style-src")).toContain("'unsafe-inline'");
  });

  it("does not allowlist sentry.io — Sentry rides the same-origin /monitoring tunnel", () => {
    expect(buildContentSecurityPolicy()).not.toContain("sentry.io");
  });
});

describe("buildSecurityHeaders", () => {
  it("emits the full companion header set with exact values", () => {
    const headers = buildSecurityHeaders();
    const byKey = Object.fromEntries(headers.map((h) => [h.key, h.value]));
    expect(byKey["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains; preload");
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=(), payment=()",
    );
    expect(byKey["Content-Security-Policy"]).toBeDefined();
  });
});

describe("next.config headers() wiring", () => {
  it("applies the security header set to every route on the exported config", async () => {
    // In the hermetic suite NEXT_PUBLIC_SENTRY_DSN is unset, so the default
    // export is the plain (un-wrapped) config — but headers() lives on
    // nextConfig itself, before the Sentry branch, so both paths carry it.
    expect(nextConfig.headers).toBeTypeOf("function");
    const routes = await nextConfig.headers!();
    expect(routes).toHaveLength(1);
    const route = routes[0]!;
    expect(route.source).toBe("/(.*)");
    const keys = route.headers.map((h) => h.key);
    expect(keys).toEqual([
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]);
    const csp = route.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    // Suite env blanks NEXT_PUBLIC_SUPABASE_URL, so the wired CSP must carry
    // the wildcard fallback pair.
    expect(csp).toContain("wss://*.supabase.co");
  });
});

import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

export interface SecurityHeaderOptions {
  /**
   * NEXT_PUBLIC_SUPABASE_URL at config-eval time. When absent or unparsable we
   * emit the wildcard pair so a build without env still ships a working CSP.
   */
  supabaseUrl?: string;
  /** Dev needs 'unsafe-eval' for React Refresh; production must never ship it. */
  dev?: boolean;
}

/**
 * The https origin of the Supabase project plus its websocket twin. The wss://
 * entry is load-bearing: a https: source in CSP does NOT authorize websocket
 * connections, and order-chat realtime dies without it.
 */
function supabaseConnectOrigins(supabaseUrl: string | undefined): [string, string] {
  if (supabaseUrl) {
    try {
      const { origin } = new URL(supabaseUrl);
      if (origin.startsWith("http")) {
        // https -> wss (and http -> ws for a local Supabase stack).
        return [origin, origin.replace(/^http/, "ws")];
      }
    } catch {
      // Unparsable URL -> wildcard fallback below.
    }
  }
  return ["https://*.supabase.co", "wss://*.supabase.co"];
}

/**
 * Static-config CSP (no middleware nonces — Next's inline hydration scripts and
 * the JSON-LD <script> in app/layout.tsx require 'unsafe-inline' without them;
 * see DECISIONS.md). Exported as a plain function so the unit suite can assert
 * the policy without evaluating any env-dependent branches.
 */
export function buildContentSecurityPolicy(options: SecurityHeaderOptions = {}): string {
  const { supabaseUrl, dev = false } = options;
  const [supabaseHttp, supabaseWs] = supabaseConnectOrigins(supabaseUrl);
  const directives = [
    "default-src 'self'",
    // 'unsafe-inline' for Next inline scripts + JSON-LD; dev additionally
    // needs 'unsafe-eval' for React Refresh (gated so prod never carries it).
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    // Tailwind v4 + Next style injection require inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Vercel Analytics script + beacon are same-origin (/_vercel/insights/*)
    // so 'self' covers them; vitals.vercel-insights.com stays for the vitals
    // beacon variant. Sentry tunnels through same-origin /monitoring
    // (tunnelRoute below) — deliberately NO sentry.io entry here, so a tunnel
    // misconfig surfaces as a CSP violation instead of being masked.
    `connect-src 'self' ${supabaseHttp} ${supabaseWs} https://vitals.vercel-insights.com`,
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ];
  return directives.join("; ");
}

/** Full security header set applied to every route. */
export function buildSecurityHeaders(
  options: SecurityHeaderOptions = {},
): Array<{ key: string; value: string }> {
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(options) },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ];
}

const securityHeaders = buildSecurityHeaders({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  dev: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Game art and user avatars are served from Supabase Storage / remote CDNs.
  // Concrete hostnames are added here as integrations land (Phase 2+).
  images: {
    remotePatterns: [],
  },
  // Defined on nextConfig BEFORE the Sentry branch below so both export paths
  // (wrapped and plain) carry the security headers.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

// Sentry only wraps the build when a DSN is configured. On the free/offline MVP
// (no DSN, no auth token) we export the plain config so builds never touch the
// Sentry network and never emit "missing auth token" noise.
const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Upload a wider set of client files for better stack traces.
      widenClientFileUpload: true,
      disableLogger: true,
      // Route Sentry through a rewrite to dodge ad-blockers (safe default).
      tunnelRoute: "/monitoring",
    })
  : nextConfig;

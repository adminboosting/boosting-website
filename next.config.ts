import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Game art and user avatars are served from Supabase Storage / remote CDNs.
  // Concrete hostnames are added here as integrations land (Phase 2+).
  images: {
    remotePatterns: [],
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

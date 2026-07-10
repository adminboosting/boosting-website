import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

// Database integration tests (migration runner, RLS isolation, price parity).
// Backed by PGlite — an in-process Postgres 18 (WASM), so no Docker and no live
// database are required. Run with `pnpm test:db`; kept out of the fast `pnpm test`
// suite so the Vercel build stays quick and dependency-free.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/db/**/*.{test,spec}.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": root,
    },
  },
});

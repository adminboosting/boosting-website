import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

// The fast suite: unit + non-DB integration tests. This is what `pnpm test`
// runs and what the Vercel build gate depends on. The PGlite-backed database
// tests (tests/db/**) are heavier and run via `pnpm test:db` — see
// vitest.db.config.ts and the CI/gate scripts.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.{test,spec}.ts", "lib/**/*.{test,spec}.ts"],
    exclude: [...configDefaults.exclude, "tests/db/**"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.{test,spec}.ts"],
    },
  },
  resolve: {
    alias: {
      "@": root,
    },
  },
});

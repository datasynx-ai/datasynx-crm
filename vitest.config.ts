import { defineConfig } from "vitest/config";

// Run the suite under a fixed, non-UTC timezone so latent local-vs-UTC date bugs
// surface in CI (which otherwise runs in UTC and hides them). Asia/Tokyo is UTC+9
// with no DST → deterministic and exercises the "ahead of UTC" direction.
process.env.TZ = "Asia/Tokyo";

export default defineConfig({
  test: {
    env: { TZ: "Asia/Tokyo" },
    globals: false,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    setupFiles: ["__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Entry-point / CLI-glue files are exercised via the e2e CLI workflow
      // tests, not unit coverage. src/commands/* are thin Commander wrappers
      // that delegate to src/core/*; the library logic they call is what the
      // thresholds below gate. (vitest 4's AST-aware v8 coverage instruments
      // these wrappers where v3 did not, so they are scoped out explicitly.)
      exclude: ["src/cli.ts", "src/daemon/worker.ts", "src/index.ts", "src/commands/**"],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});

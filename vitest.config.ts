import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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

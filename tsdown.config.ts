import { defineConfig } from "tsdown";

const shared = {
  // No sourcemaps in the published package: it ships only built dist/ (not the
  // TypeScript source the maps reference), so maps would only bloat the tarball.
  // Enforced by scripts/check-no-sourcemaps.ts.
  sourcemap: false,
  external: [
    "@lancedb/lancedb",
    "apache-arrow",
    "@huggingface/transformers",
    "googleapis",
    "@napi-rs/canvas",
  ],
} as const;

export default defineConfig([
  // Library entries: Dual ESM + CJS for consumer compatibility
  {
    ...shared,
    entry: {
      index: "src/index.ts",
      mcp: "src/mcp/server.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
  },
  // Binary + daemon: ESM only (executables don't need CJS)
  {
    ...shared,
    entry: {
      cli: "src/cli.ts",
      "daemon/worker": "src/daemon/worker.ts",
    },
    format: ["esm"],
    dts: false,
    clean: false,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);

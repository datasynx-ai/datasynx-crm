import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    mcp: "src/mcp/server.ts",
    "daemon/worker": "src/daemon/worker.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    "@lancedb/lancedb",
    "apache-arrow",
    "@huggingface/transformers",
    "googleapis",
  ],
  banner: {
    js: (ctx) => ctx.output.fileName.startsWith("cli") ? "#!/usr/bin/env node" : "",
  },
});

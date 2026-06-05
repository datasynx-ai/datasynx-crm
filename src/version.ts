import { createRequire } from "node:module";

/**
 * Single source of truth for the package version: read it from package.json at
 * runtime so the CLI (`--version`), the MCP `serverInfo`, and backup metadata
 * can never drift from what is actually published (they used to be hardcoded to
 * a stale `0.1.0`).
 *
 * Works both unbundled (vitest/tsx: `src/version.ts` → `../package.json`) and
 * in the published bundle (`dist/{cli,mcp,index}.js` → `../package.json`, since
 * package.json sits at the package root next to `dist/`).
 */
function resolveVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    if (typeof pkg.version === "string" && pkg.version.length > 0) {
      return pkg.version;
    }
  } catch {
    // Fall through to the safe default below.
  }
  return "0.0.0";
}

export const VERSION = resolveVersion();

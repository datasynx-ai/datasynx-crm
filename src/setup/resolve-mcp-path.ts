import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Resolve the absolute path to the bundled MCP server entry (`dist/mcp.js`).
 *
 * tsdown bundles every command (including `init`) into `dist/cli.js`, so at
 * runtime `import.meta.url` for any command resolves to `dist/cli.js` — i.e.
 * `mcp.js` is a *sibling*, not two directories up. The previous hardcoded
 * `../../dist/mcp.js` assumed an unbundled `dist/commands/` layout and produced
 * a non-existent path (`@datasynx/dist/mcp.js`), which silently broke the
 * Claude Code / Codex / Cursor stdio integration on every fresh install.
 *
 * We therefore probe the realistic layouts and return the first that exists:
 *  - prod (bundled): `dist/cli.js` → `dist/mcp.js` (sibling)
 *  - dev (tsx, src/commands/*.ts): `../../dist/mcp.js`
 *  - defensive: one level up
 *
 * @param moduleUrl `import.meta.url` of the caller.
 * @returns Absolute path to `mcp.js`. Falls back to the sibling candidate when
 *   none exist yet (e.g. before a build), so callers always get a usable value.
 */
export function resolveMcpServerPath(moduleUrl: string): string {
  const here = path.dirname(fileURLToPath(moduleUrl));
  const candidates = [
    path.resolve(here, "mcp.js"), // prod: dist/cli.js → dist/mcp.js (sibling)
    path.resolve(here, "../../dist/mcp.js"), // dev: src/commands → dist/mcp.js
    path.resolve(here, "../mcp.js"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0]!;
}

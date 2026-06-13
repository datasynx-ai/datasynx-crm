#!/usr/bin/env node
// Consumer install/init integration test — real built dist, real fs, real CLI.
//
// Regression guard for #25: `dxcrm init` once wrote a broken MCP server path
// (`@datasynx/dist/mcp.js`, missing the package segment) into ~/.claude.json,
// so Claude Code / Codex / Cursor could never launch the stdio server on a
// fresh global install. The unit tests for resolveMcpServerPath() run against
// memfs and therefore cannot catch a *bundler-layout* regression — if tsdown
// ever stops emitting `init` into dist/cli.js (e.g. reverts to dist/commands/
// init.js), the memfs test still passes while the real path breaks again.
//
// This test exercises the actual built artifact end to end: it runs
// `node dist/cli.js init` in a throwaway HOME and asserts the MCP server path
// it writes (a) points at the real dist/mcp.js and (b) exists on disk.
//
// Run from project root after `npm run build`:
//   node __tests__/e2e/install-init.mjs
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { resolve, join } from "path";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const distCli = resolve(projectRoot, "dist/cli.js");
const distMcp = resolve(projectRoot, "dist/mcp.js");

function fail(msg) {
  console.error(`✗ install/init Consumer Test FAILED — ${msg}`);
  process.exit(1);
}

// 0. The built layout itself: cli.js and mcp.js must be siblings in dist/.
//    This is the invariant resolveMcpServerPath() relies on (sibling-first).
if (!existsSync(distCli))
  fail(`dist/cli.js not found — run \`npm run build\` first (looked at ${distCli})`);
if (!existsSync(distMcp))
  fail(`dist/mcp.js not found — run \`npm run build\` first (looked at ${distMcp})`);

// 1. Run `dxcrm init` against a throwaway HOME + data dir, with the real CLI.
const work = mkdtempSync(join(tmpdir(), "dxcrm-init-e2e-"));
const home = join(work, "home");
const dataDir = join(work, "data");
mkdirSync(home, { recursive: true });
mkdirSync(dataDir, { recursive: true });

// Seed ~/.claude.json so the Claude Code adapter is "detected" (mirrors a user
// who already has Claude Code installed) and writes its MCP server config.
const claudeJsonPath = join(home, ".claude.json");
writeFileSync(claudeJsonPath, "{}\n");

try {
  execFileSync(process.execPath, [distCli, "init"], {
    cwd: dataDir,
    // Pin the vault explicitly so the test is hermetic: init resolves
    // DXCRM_DATA_DIR ?? cwd, and a stray DXCRM_DATA_DIR in the runner's
    // environment must not redirect init away from this throwaway dataDir.
    env: { ...process.env, HOME: home, USERPROFILE: home, DXCRM_DATA_DIR: dataDir },
    stdio: "pipe",
  });
} catch (err) {
  fail(`\`dxcrm init\` exited non-zero: ${err.message}`);
}

// 2. Read back the MCP server path init wrote into ~/.claude.json.
let mcpPath;
try {
  const json = JSON.parse(readFileSync(claudeJsonPath, "utf-8"));
  mcpPath = json?.mcpServers?.["datasynx-opencrm"]?.args?.[0];
} catch (err) {
  fail(`could not parse generated ~/.claude.json: ${err.message}`);
}

if (!mcpPath) fail("init did not register the datasynx-opencrm MCP server in ~/.claude.json");

// 3. The headline assertion: the path init wrote must exist on disk.
if (!existsSync(mcpPath)) {
  fail(`MCP server path written by init does not exist on disk: ${mcpPath}`);
}

// 4. It must be the real dist/mcp.js, and must not be the broken #25 path.
if (resolve(mcpPath) !== resolve(distMcp)) {
  fail(
    `MCP server path is not the built dist/mcp.js\n   got:      ${mcpPath}\n   expected: ${distMcp}`
  );
}
if (mcpPath.includes(join("@datasynx", "dist", "mcp.js"))) {
  fail(`MCP server path regressed to the broken #25 form (missing package segment): ${mcpPath}`);
}

// Clean up (cwd is the project root, never inside `work`, so this is safe).
rmSync(work, { recursive: true, force: true });

console.log("✅ install/init Consumer Test passed");
console.log(`   init wrote MCP server path: ${mcpPath}`);
console.log(`   exists on disk: true`);

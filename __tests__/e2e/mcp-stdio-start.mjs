#!/usr/bin/env node
// `dxcrm mcp start` (stdio) real-build regression guard — issue #43.
//
// Regression for #43: `dxcrm mcp start` initialized the MCP server *twice* on
// the same stdin/stdout. The CLI command (src/commands/guide.ts) imports
// `startStdio` from the server module and calls it explicitly — but the server
// module also had an *unguarded* module-level entry block that ran `startStdio()`
// on every import. Two StdioServerTransport instances on one stdio corrupted the
// JSON-RPC stream, so a connecting client failed immediately with
// `MCP error -32000: Connection closed`.
//
// This is a *bundler-layout* bug: tsdown emits the server code into both
// `dist/mcp.js` (standalone entry) and a shared chunk that `dist/cli.js`
// dynamically imports — both carried the entry block. It therefore cannot be
// caught against memfs / direct imports; it only manifests through the real
// built CLI driven by a real MCP client. Hence this standalone real-build guard,
// modeled on install-init.mjs (#25).
//
// Covers both stdio launch paths:
//   1. `dxcrm mcp start`  — CLI imports + calls startStdio (must NOT double-start)
//   2. `node dist/mcp.js` — the auto-registered integrations' entry (must start once)
//
// Run from project root after `npm run build`:
//   node __tests__/e2e/mcp-stdio-start.mjs
import { existsSync, mkdtempSync, rmSync } from "fs";
import { resolve, join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const distCli = resolve(projectRoot, "dist/cli.js");
const distMcp = resolve(projectRoot, "dist/mcp.js");

function fail(msg) {
  console.error(`✗ mcp stdio start Regression Test FAILED — ${msg}`);
  process.exit(1);
}

if (!existsSync(distCli))
  fail(`dist/cli.js not found — run \`npm run build\` first (looked at ${distCli})`);
if (!existsSync(distMcp))
  fail(`dist/mcp.js not found — run \`npm run build\` first (looked at ${distMcp})`);

// Drive one stdio launch path with a real MCP client and assert the server
// (a) accepts initialize + tools/list and (b) initialized exactly once.
async function checkStdioStart(label, args) {
  const work = mkdtempSync(join(tmpdir(), "dxcrm-mcp-stdio-e2e-"));
  let stderr = "";

  const transport = new StdioClientTransport({
    command: process.execPath,
    args,
    env: { ...getDefaultEnvironment(), DXCRM_DATA_DIR: work },
    stderr: "pipe",
    cwd: work,
  });
  transport.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const client = new Client({ name: "mcp-stdio-start-e2e", version: "1.0.0" });

  try {
    // (1) initialize — with the double-start bug this throws `Connection closed`.
    await client.connect(transport);

    // (2) tools/list must succeed and return the tool catalog.
    const { tools } = await client.listTools();
    if (!Array.isArray(tools) || tools.length === 0) {
      throw new Error(`tools/list returned no tools (got ${tools?.length ?? "none"})`);
    }

    // Give stderr a moment to flush the startup log line.
    await new Promise((r) => setTimeout(r, 200));

    // (3) the server must have initialized exactly once.
    const starts = (stderr.match(/running via stdio/g) ?? []).length;
    if (starts !== 1) {
      throw new Error(
        `server initialized ${starts}× (expected exactly 1) — "running via stdio" count in stderr:\n${stderr}`
      );
    }

    console.log(`✅ ${label}: initialize + tools/list ok (${tools.length} tools), started once`);
  } finally {
    await client.close().catch(() => {});
    rmSync(work, { recursive: true, force: true });
  }
}

try {
  await checkStdioStart("dxcrm mcp start", [distCli, "mcp", "start"]);
  await checkStdioStart("node dist/mcp.js", [distMcp]);
  console.log("✅ mcp stdio start Regression Test passed");
} catch (err) {
  fail(err?.message ?? String(err));
}

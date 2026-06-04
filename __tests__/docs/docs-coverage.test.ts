import { describe, it, expect } from "vitest";
// Loaded as raw strings at transform time so the global memfs `fs` mock
// (see __tests__/setup.ts) doesn't intercept the reads.
import cliRef from "../../docs/cli-reference.md?raw";
import mcpRef from "../../docs/mcp-tools.md?raw";
import indexHtml from "../../docs/index.html?raw";
import { ALL_COMMANDS } from "../../src/commands/registry.js";
import { ALL_TOOLS } from "../../src/setup/harness-content.js";
import { CAPABILITIES_TEXT } from "../../src/mcp/capabilities.js";

/**
 * Drift guard: the published docs must stay in lockstep with the code.
 * If a command or MCP tool is added without running `npm run docs:generate`
 * (or if a description is left blank) these tests fail — so the docs site can
 * never silently fall behind what actually ships.
 */
const commandNames = ALL_COMMANDS.map((c) => c.name());
const toolNames = ALL_TOOLS as readonly string[];

describe("docs coverage — CLI commands", () => {
  it("every command has a non-empty description", () => {
    const blank = ALL_COMMANDS.filter((c) => !(c.description() || "").trim()).map((c) => c.name());
    expect(blank, `commands missing .description(): ${blank.join(", ")}`).toEqual([]);
  });

  it.each(commandNames)("`dxcrm %s` is in cli-reference.md", (name) => {
    expect(cliRef).toContain(`dxcrm ${name}`);
  });

  it.each(commandNames)("`dxcrm %s` is on the docs site (index.html)", (name) => {
    expect(indexHtml).toContain(`dxcrm ${name}`);
  });
});

describe("docs coverage — MCP tools", () => {
  it("capabilities table documents every registered tool", () => {
    const rows = new Set(
      [...CAPABILITIES_TEXT.matchAll(/^\|\s*([a-z_]+)\s*\|/gm)].map((m) => m[1])
    );
    const missing = toolNames.filter((t) => !rows.has(t));
    expect(missing, `tools missing from capabilities.ts table: ${missing.join(", ")}`).toEqual([]);
  });

  it.each(toolNames)("`%s` is in mcp-tools.md", (name) => {
    expect(mcpRef).toContain(name);
  });

  it.each(toolNames)("`%s` is on the docs site (index.html)", (name) => {
    expect(indexHtml).toContain(name);
  });
});

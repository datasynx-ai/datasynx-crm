import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { TOOL_COUNT } from "../../src/setup/harness-content.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { description: string };

describe("advertised MCP tool count", () => {
  it("package.json description matches the actual TOOL_COUNT (no drift)", () => {
    const match = pkg.description.match(/(\d+)\s+MCP tools/i);
    expect(match, `description should mention "<n> MCP tools": ${pkg.description}`).not.toBeNull();
    expect(Number(match![1])).toBe(TOOL_COUNT);
  });
});

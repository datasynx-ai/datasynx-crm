import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import path from "path";
import { pathToFileURL } from "url";
import { resolveMcpServerPath } from "../../src/setup/resolve-mcp-path.js";

// `fs` is globally mocked with memfs (see __tests__/setup.ts), so we lay out
// fake package directories with vol.fromJSON and let resolveMcpServerPath probe
// them via fs.existsSync.
describe("resolveMcpServerPath", () => {
  beforeEach(() => {
    vol.reset();
  });

  it("resolves mcp.js as a sibling of the bundled cli.js (prod layout)", () => {
    const dist = "/pkg/dist";
    vol.fromJSON({ [`${dist}/cli.js`]: "", [`${dist}/mcp.js`]: "" });

    const resolved = resolveMcpServerPath(pathToFileURL(`${dist}/cli.js`).href);

    expect(resolved).toBe(path.join(dist, "mcp.js"));
  });

  it("never produces a path missing the package directory (regression for the broken init path)", () => {
    const dist = "/root/node_modules/@datasynx/agentic-crm/dist";
    vol.fromJSON({ [`${dist}/cli.js`]: "", [`${dist}/mcp.js`]: "" });

    const resolved = resolveMcpServerPath(pathToFileURL(`${dist}/cli.js`).href);

    expect(resolved).toContain(path.join("@datasynx", "agentic-crm", "dist", "mcp.js"));
    expect(resolved).not.toContain(path.join("@datasynx", "dist", "mcp.js"));
  });

  it("resolves the dev (tsx) layout: src/commands → dist/mcp.js", () => {
    vol.fromJSON({ "/proj/dist/mcp.js": "" });

    const resolved = resolveMcpServerPath(pathToFileURL("/proj/src/commands/init.ts").href);

    expect(resolved).toBe(path.join("/proj", "dist", "mcp.js"));
  });

  it("falls back to the sibling candidate when nothing exists yet", () => {
    const resolved = resolveMcpServerPath(pathToFileURL("/empty/dist/cli.js").href);
    expect(resolved).toBe(path.join("/empty", "dist", "mcp.js"));
  });
});

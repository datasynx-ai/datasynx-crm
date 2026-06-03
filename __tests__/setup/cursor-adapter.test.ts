import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import os from "os";
import path from "path";

import { CursorAdapter } from "../../src/setup/adapters/cursor.js";

const HOME = os.homedir();
const CURSOR_DIR = path.join(HOME, ".cursor");
const CURSOR_GLOBAL_MCP = path.join(CURSOR_DIR, "mcp.json");

const TEST_CONFIG = {
  mcpServerPath: "/usr/local/lib/node_modules/datasynx-opencrm/dist/mcp.js",
  dataDir: "/home/user/crm",
  httpPort: 3847,
  serverName: "datasynx-opencrm",
};

beforeEach(() => {
  vol.reset();
});

describe("CursorAdapter", () => {
  it("detect() returns true when ~/.cursor/ exists", () => {
    vol.fromJSON({ [`${CURSOR_DIR}/.keep`]: "" });
    const adapter = new CursorAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns true when ~/.cursor/mcp.json exists", () => {
    vol.fromJSON({ [CURSOR_GLOBAL_MCP]: "{}" });
    const adapter = new CursorAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns false when nothing exists", () => {
    const adapter = new CursorAdapter();
    expect(adapter.detect()).toBe(false);
  });

  it("install() writes to ~/.cursor/mcp.json", async () => {
    const adapter = new CursorAdapter();
    const result = await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    expect(fs.existsSync(CURSOR_GLOBAL_MCP)).toBe(true);
    expect(result.configPath).toBe(CURSOR_GLOBAL_MCP);
  });

  it("install() writes correct mcpServers entry", async () => {
    const adapter = new CursorAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CURSOR_GLOBAL_MCP, "utf-8") as string) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(content.mcpServers["datasynx-opencrm"]).toBeDefined();
    expect(content.mcpServers["datasynx-opencrm"].command).toBe(process.execPath);
    expect(content.mcpServers["datasynx-opencrm"].args).toContain(TEST_CONFIG.mcpServerPath);
  });

  it("install() creates .cursor/rules/datasynx-crm.mdc with alwaysApply: true", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new CursorAdapter();
    const result = await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const rulesPath = path.join(TEST_CONFIG.dataDir, ".cursor", "rules", "datasynx-crm.mdc");
    expect(fs.existsSync(rulesPath)).toBe(true);
    const content = fs.readFileSync(rulesPath, "utf-8") as string;
    expect(content).toContain("alwaysApply: true");
    expect(content).toContain("DatasynxOpenCRM");
    expect(result.harnessFiles).toContain(rulesPath);
  });

  it("install() does not overwrite existing .cursor/rules/ datasynx-crm.mdc", async () => {
    const existingRules = "---\nalwaysApply: true\n---\n# Custom CRM Rules\nAlready configured.";
    vol.fromJSON({
      [TEST_CONFIG.dataDir]: null,
      [path.join(TEST_CONFIG.dataDir, ".cursor", "rules", "datasynx-crm.mdc")]: existingRules,
    });

    const adapter = new CursorAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(
      path.join(TEST_CONFIG.dataDir, ".cursor", "rules", "datasynx-crm.mdc"),
      "utf-8"
    ) as string;
    expect(content).toBe(existingRules);
  });

  it("install() is idempotent", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new CursorAdapter();
    await adapter.install(TEST_CONFIG);
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CURSOR_GLOBAL_MCP, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    const keys = Object.keys(content.mcpServers).filter((k) => k === "datasynx-opencrm");
    expect(keys.length).toBe(1);
  });

  it("install() preserves existing mcp.json entries", async () => {
    vol.fromJSON({
      [CURSOR_GLOBAL_MCP]: JSON.stringify({
        mcpServers: { "other-server": { command: "other", args: [] } },
      }),
      [TEST_CONFIG.dataDir]: null,
    });

    const adapter = new CursorAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CURSOR_GLOBAL_MCP, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["other-server"]).toBeDefined();
    expect(content.mcpServers["datasynx-opencrm"]).toBeDefined();
  });

  it("install() returns correct framework name", async () => {
    const adapter = new CursorAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.framework).toBe("Cursor");
    expect(result.success).toBe(true);
    expect(result.transport).toBe("stdio");
  });

  it("install() notes mention restart", async () => {
    const adapter = new CursorAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.notes?.toLowerCase()).toContain("restart");
  });

  it("uninstall() removes only datasynx-opencrm entry from mcp.json", async () => {
    vol.fromJSON({
      [CURSOR_GLOBAL_MCP]: JSON.stringify({
        mcpServers: {
          "other-server": { command: "other", args: [] },
          "datasynx-opencrm": { command: process.execPath, args: [] },
        },
      }),
    });

    const adapter = new CursorAdapter();
    await adapter.uninstall();

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CURSOR_GLOBAL_MCP, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["other-server"]).toBeDefined();
    expect(content.mcpServers["datasynx-opencrm"]).toBeUndefined();
  });

  it("isInstalled() returns false before install", () => {
    const adapter = new CursorAdapter();
    expect(adapter.isInstalled()).toBe(false);
  });

  it("isInstalled() returns true after install", async () => {
    const adapter = new CursorAdapter();
    await adapter.install(TEST_CONFIG);
    expect(adapter.isInstalled()).toBe(true);
  });

  it("name is 'Cursor'", () => {
    expect(new CursorAdapter().name).toBe("Cursor");
  });

  it("isInstalled() returns false when config contains invalid JSON", () => {
    vol.fromJSON({ [CURSOR_GLOBAL_MCP]: "NOT VALID JSON{{" });
    const adapter = new CursorAdapter();
    expect(adapter.isInstalled()).toBe(false);
  });

  it("install() handles existing mcp.json with no mcpServers key", async () => {
    vol.fromJSON({ [CURSOR_GLOBAL_MCP]: JSON.stringify({ someOtherKey: true }) });
    const adapter = new CursorAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CURSOR_GLOBAL_MCP, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["datasynx-opencrm"]).toBeDefined();
  });

  it("install() survives existing mcp.json with invalid JSON", async () => {
    vol.fromJSON({ [CURSOR_GLOBAL_MCP]: "INVALID JSON{{" });
    const adapter = new CursorAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.success).toBe(true);
  });

  it("uninstall() does nothing when mcp.json does not exist", async () => {
    const adapter = new CursorAdapter();
    await expect(adapter.uninstall()).resolves.toBeUndefined();
  });

  it("uninstall() handles config with no mcpServers key", async () => {
    vol.fromJSON({ [CURSOR_GLOBAL_MCP]: JSON.stringify({ someKey: "value" }) });
    const adapter = new CursorAdapter();
    await adapter.uninstall();

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CURSOR_GLOBAL_MCP, "utf-8") as string) as Record<
      string,
      unknown
    >;
    expect(content["someKey"]).toBe("value");
  });

  it("uninstall() silently ignores invalid JSON in config", async () => {
    vol.fromJSON({ [CURSOR_GLOBAL_MCP]: "INVALID JSON{{" });
    const adapter = new CursorAdapter();
    await expect(adapter.uninstall()).resolves.toBeUndefined();
  });
});

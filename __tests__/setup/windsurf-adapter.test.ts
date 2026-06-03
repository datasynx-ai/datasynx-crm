import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import os from "os";
import path from "path";

import { WindsurfAdapter } from "../../src/setup/adapters/windsurf.js";

const HOME = os.homedir();
const WINDSURF_DIR = path.join(HOME, ".codeium", "windsurf");
const WINDSURF_CONFIG = path.join(WINDSURF_DIR, "mcp_config.json");

const TEST_CONFIG = {
  mcpServerPath: "/usr/local/lib/node_modules/datasynx-opencrm/dist/mcp.js",
  dataDir: "/home/user/crm",
  httpPort: 3847,
  serverName: "datasynx-opencrm",
};

beforeEach(() => {
  vol.reset();
});

describe("WindsurfAdapter", () => {
  it("detect() returns true when ~/.codeium/windsurf/ exists", () => {
    vol.fromJSON({ [`${WINDSURF_DIR}/.keep`]: "" });
    const adapter = new WindsurfAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns true when mcp_config.json exists", () => {
    vol.fromJSON({ [WINDSURF_CONFIG]: "{}" });
    const adapter = new WindsurfAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns false when nothing exists", () => {
    const adapter = new WindsurfAdapter();
    expect(adapter.detect()).toBe(false);
  });

  it("install() writes to ~/.codeium/windsurf/mcp_config.json", async () => {
    const adapter = new WindsurfAdapter();
    const result = await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    expect(fs.existsSync(WINDSURF_CONFIG)).toBe(true);
    expect(result.configPath).toBe(WINDSURF_CONFIG);
  });

  it("install() uses absolute path (process.execPath) as command", async () => {
    const adapter = new WindsurfAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(WINDSURF_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, { command: string }>;
    };
    expect(content.mcpServers["datasynx-opencrm"]?.command).toBe(process.execPath);
    // Verify it's an absolute path
    expect(path.isAbsolute(content.mcpServers["datasynx-opencrm"]?.command)).toBe(true);
  });

  it("install() is idempotent", async () => {
    const adapter = new WindsurfAdapter();
    await adapter.install(TEST_CONFIG);
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(WINDSURF_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    const keys = Object.keys(content.mcpServers).filter((k) => k === "datasynx-opencrm");
    expect(keys.length).toBe(1);
  });

  it("install() preserves existing mcp_config.json entries", async () => {
    vol.fromJSON({
      [WINDSURF_CONFIG]: JSON.stringify({
        mcpServers: { "other-server": { command: "other", args: [] } },
      }),
    });

    const adapter = new WindsurfAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(WINDSURF_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["other-server"]).toBeDefined();
    expect(content.mcpServers["datasynx-opencrm"]).toBeDefined();
  });

  it("install() writes no harness files", async () => {
    const adapter = new WindsurfAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.harnessFiles).toHaveLength(0);
  });

  it("install() returns correct framework name", async () => {
    const adapter = new WindsurfAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.framework).toBe("Windsurf");
    expect(result.success).toBe(true);
    expect(result.transport).toBe("stdio");
  });

  it("install() notes mention restart", async () => {
    const adapter = new WindsurfAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.notes?.toLowerCase()).toContain("restart");
  });

  it("uninstall() removes only datasynx-opencrm entry", async () => {
    vol.fromJSON({
      [WINDSURF_CONFIG]: JSON.stringify({
        mcpServers: {
          "other-server": { command: "other", args: [] },
          "datasynx-opencrm": { command: process.execPath, args: [] },
        },
      }),
    });

    const adapter = new WindsurfAdapter();
    await adapter.uninstall();

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(WINDSURF_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["other-server"]).toBeDefined();
    expect(content.mcpServers["datasynx-opencrm"]).toBeUndefined();
  });

  it("isInstalled() returns false before install", () => {
    const adapter = new WindsurfAdapter();
    expect(adapter.isInstalled()).toBe(false);
  });

  it("isInstalled() returns true after install", async () => {
    const adapter = new WindsurfAdapter();
    await adapter.install(TEST_CONFIG);
    expect(adapter.isInstalled()).toBe(true);
  });

  it("name is 'Windsurf'", () => {
    expect(new WindsurfAdapter().name).toBe("Windsurf");
  });

  it("isInstalled() returns false when config contains invalid JSON", () => {
    vol.fromJSON({ [WINDSURF_CONFIG]: "NOT VALID JSON{{" });
    const adapter = new WindsurfAdapter();
    expect(adapter.isInstalled()).toBe(false);
  });

  it("install() handles existing config with no mcpServers key", async () => {
    vol.fromJSON({ [WINDSURF_CONFIG]: JSON.stringify({ someOtherKey: true }) });
    const adapter = new WindsurfAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(WINDSURF_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["datasynx-opencrm"]).toBeDefined();
  });

  it("install() survives existing config with invalid JSON", async () => {
    vol.fromJSON({ [WINDSURF_CONFIG]: "INVALID JSON{{" });
    const adapter = new WindsurfAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.success).toBe(true);
  });

  it("uninstall() does nothing when config file does not exist", async () => {
    const adapter = new WindsurfAdapter();
    await expect(adapter.uninstall()).resolves.toBeUndefined();
  });

  it("uninstall() handles config with no mcpServers key", async () => {
    vol.fromJSON({ [WINDSURF_CONFIG]: JSON.stringify({ someKey: "value" }) });
    const adapter = new WindsurfAdapter();
    await adapter.uninstall();

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(WINDSURF_CONFIG, "utf-8") as string) as Record<
      string,
      unknown
    >;
    expect(content["someKey"]).toBe("value");
  });

  it("uninstall() silently ignores invalid JSON in config", async () => {
    vol.fromJSON({ [WINDSURF_CONFIG]: "INVALID JSON{{" });
    const adapter = new WindsurfAdapter();
    await expect(adapter.uninstall()).resolves.toBeUndefined();
  });
});

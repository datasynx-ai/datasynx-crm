import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";
import os from "os";
import path from "path";

import { ClaudeDesktopAdapter } from "../../src/setup/adapters/claude-desktop.js";

const HOME = os.homedir();

// Compute platform-specific config path
function getDesktopConfigPath(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(
        HOME,
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json"
      );
    case "win32":
      return path.join(process.env["APPDATA"] ?? HOME, "Claude", "claude_desktop_config.json");
    default:
      return path.join(HOME, ".config", "claude-desktop", "claude_desktop_config.json");
  }
}

const DESKTOP_CONFIG = getDesktopConfigPath();
const DESKTOP_CONFIG_DIR = path.dirname(DESKTOP_CONFIG);

const TEST_CONFIG = {
  mcpServerPath: "/usr/local/lib/node_modules/datasynx-opencrm/dist/mcp.js",
  dataDir: "/home/user/crm",
  httpPort: 3847,
  serverName: "datasynx-opencrm",
};

beforeEach(() => {
  vol.reset();
});

describe("ClaudeDesktopAdapter", () => {
  it("detect() returns true when desktop config file exists", () => {
    vol.fromJSON({ [DESKTOP_CONFIG]: "{}" });
    const adapter = new ClaudeDesktopAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns true when config directory exists", () => {
    vol.fromJSON({ [`${DESKTOP_CONFIG_DIR}/.keep`]: "" });
    const adapter = new ClaudeDesktopAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns false when nothing exists", () => {
    const adapter = new ClaudeDesktopAdapter();
    expect(adapter.detect()).toBe(false);
  });

  it("install() creates config directory if not exists", async () => {
    const adapter = new ClaudeDesktopAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    expect(fs.existsSync(DESKTOP_CONFIG_DIR)).toBe(true);
  });

  it("install() writes to platform-specific config path", async () => {
    const adapter = new ClaudeDesktopAdapter();
    const result = await adapter.install(TEST_CONFIG);

    expect(result.configPath).toBe(DESKTOP_CONFIG);
    const { fs } = await import("memfs");
    expect(fs.existsSync(DESKTOP_CONFIG)).toBe(true);
  });

  it("install() writes mcpServers entry with correct shape", async () => {
    const adapter = new ClaudeDesktopAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(DESKTOP_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(content.mcpServers["datasynx-opencrm"]).toBeDefined();
    expect(content.mcpServers["datasynx-opencrm"].command).toBe(process.execPath);
  });

  it("install() deep-merges into existing config without overwriting other entries", async () => {
    vol.fromJSON({
      [DESKTOP_CONFIG]: JSON.stringify({
        mcpServers: {
          "existing-server": { command: "other", args: [] },
        },
      }),
    });

    const adapter = new ClaudeDesktopAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(DESKTOP_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["existing-server"]).toBeDefined();
    expect(content.mcpServers["datasynx-opencrm"]).toBeDefined();
  });

  it("install() is idempotent", async () => {
    const adapter = new ClaudeDesktopAdapter();
    await adapter.install(TEST_CONFIG);
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(DESKTOP_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    const keys = Object.keys(content.mcpServers).filter((k) => k === "datasynx-opencrm");
    expect(keys.length).toBe(1);
  });

  it("install() notes contain restart instruction", async () => {
    const adapter = new ClaudeDesktopAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.notes?.toLowerCase()).toContain("restart");
  });

  it("install() returns no harness files (harnessFiles is empty)", async () => {
    const adapter = new ClaudeDesktopAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.harnessFiles).toHaveLength(0);
  });

  it("install() returns correct framework name", async () => {
    const adapter = new ClaudeDesktopAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.framework).toBe("Claude Desktop");
    expect(result.success).toBe(true);
    expect(result.transport).toBe("stdio");
  });

  it("uninstall() removes only datasynx-opencrm entry", async () => {
    vol.fromJSON({
      [DESKTOP_CONFIG]: JSON.stringify({
        mcpServers: {
          "other-server": { command: "other", args: [] },
          "datasynx-opencrm": { command: process.execPath, args: [] },
        },
      }),
    });

    const adapter = new ClaudeDesktopAdapter();
    await adapter.uninstall();

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(DESKTOP_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["other-server"]).toBeDefined();
    expect(content.mcpServers["datasynx-opencrm"]).toBeUndefined();
  });

  it("isInstalled() returns false before install", () => {
    const adapter = new ClaudeDesktopAdapter();
    expect(adapter.isInstalled()).toBe(false);
  });

  it("isInstalled() returns true after install", async () => {
    const adapter = new ClaudeDesktopAdapter();
    await adapter.install(TEST_CONFIG);
    expect(adapter.isInstalled()).toBe(true);
  });

  it("name is 'Claude Desktop'", () => {
    expect(new ClaudeDesktopAdapter().name).toBe("Claude Desktop");
  });

  it("isInstalled() returns false when config file has invalid JSON", () => {
    vol.fromJSON({ [DESKTOP_CONFIG]: "{ not valid json" });
    const adapter = new ClaudeDesktopAdapter();
    expect(adapter.isInstalled()).toBe(false);
  });

  it("install() handles corrupt existing config by treating it as empty", async () => {
    vol.fromJSON({ [DESKTOP_CONFIG]: "{ not valid json" });
    const adapter = new ClaudeDesktopAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.success).toBe(true);
    const { fs } = await import("memfs");
    const json = JSON.parse(fs.readFileSync(DESKTOP_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(json.mcpServers["datasynx-opencrm"]).toBeDefined();
  });

  it("uninstall() does not throw on corrupt config", async () => {
    vol.fromJSON({ [DESKTOP_CONFIG]: "bad json" });
    const adapter = new ClaudeDesktopAdapter();
    await expect(adapter.uninstall()).resolves.toBeUndefined();
  });
});

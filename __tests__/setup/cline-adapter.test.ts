import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import os from "os";
import path from "path";

import { ClineAdapter } from "../../src/setup/adapters/cline.js";

const HOME = os.homedir();
const CLINE_DIR = path.join(HOME, ".cline");
const CLINE_CONFIG = path.join(CLINE_DIR, "data", "settings", "cline_mcp_settings.json");

const TEST_CONFIG = {
  mcpServerPath: "/usr/local/lib/node_modules/datasynx-opencrm/dist/mcp.js",
  dataDir: "/home/user/crm",
  httpPort: 3847,
  serverName: "datasynx-opencrm",
};

beforeEach(() => {
  vol.reset();
});

describe("ClineAdapter", () => {
  it("detect() returns true when ~/.cline/ exists", () => {
    vol.fromJSON({ [`${CLINE_DIR}/.keep`]: "" });
    const adapter = new ClineAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns true when cline_mcp_settings.json exists", () => {
    vol.fromJSON({ [CLINE_CONFIG]: "{}" });
    const adapter = new ClineAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns false when nothing exists", () => {
    const adapter = new ClineAdapter();
    expect(adapter.detect()).toBe(false);
  });

  it("install() writes to cline_mcp_settings.json", async () => {
    const adapter = new ClineAdapter();
    const result = await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    expect(fs.existsSync(CLINE_CONFIG)).toBe(true);
    expect(result.configPath).toBe(CLINE_CONFIG);
  });

  it("install() uses absolute paths — never relative", async () => {
    const adapter = new ClineAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CLINE_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(path.isAbsolute(content.mcpServers["datasynx-opencrm"]?.command ?? "")).toBe(true);
    expect(path.isAbsolute(content.mcpServers["datasynx-opencrm"]?.args?.[0] ?? "")).toBe(true);
  });

  it("install() is idempotent", async () => {
    const adapter = new ClineAdapter();
    await adapter.install(TEST_CONFIG);
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CLINE_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    const keys = Object.keys(content.mcpServers).filter((k) => k === "datasynx-opencrm");
    expect(keys.length).toBe(1);
  });

  it("install() preserves existing cline_mcp_settings.json entries", async () => {
    vol.fromJSON({
      [CLINE_CONFIG]: JSON.stringify({
        mcpServers: { "other-server": { command: "/usr/bin/other", args: [] } },
      }),
    });

    const adapter = new ClineAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CLINE_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["other-server"]).toBeDefined();
    expect(content.mcpServers["datasynx-opencrm"]).toBeDefined();
  });

  it("install() creates parent directories if not exists", async () => {
    const adapter = new ClineAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    expect(fs.existsSync(path.dirname(CLINE_CONFIG))).toBe(true);
  });

  it("install() returns no harness files", async () => {
    const adapter = new ClineAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.harnessFiles).toHaveLength(0);
  });

  it("install() returns correct framework name", async () => {
    const adapter = new ClineAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.framework).toBe("Cline");
    expect(result.success).toBe(true);
    expect(result.transport).toBe("stdio");
  });

  it("uninstall() removes only datasynx-opencrm entry", async () => {
    vol.fromJSON({
      [CLINE_CONFIG]: JSON.stringify({
        mcpServers: {
          "other-server": { command: "/usr/bin/other", args: [] },
          "datasynx-opencrm": { command: process.execPath, args: [] },
        },
      }),
    });

    const adapter = new ClineAdapter();
    await adapter.uninstall();

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CLINE_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["other-server"]).toBeDefined();
    expect(content.mcpServers["datasynx-opencrm"]).toBeUndefined();
  });

  it("isInstalled() returns false before install", () => {
    const adapter = new ClineAdapter();
    expect(adapter.isInstalled()).toBe(false);
  });

  it("isInstalled() returns true after install", async () => {
    const adapter = new ClineAdapter();
    await adapter.install(TEST_CONFIG);
    expect(adapter.isInstalled()).toBe(true);
  });

  it("name is 'Cline'", () => {
    expect(new ClineAdapter().name).toBe("Cline");
  });

  it("isInstalled() returns false when config file contains invalid JSON", () => {
    vol.fromJSON({ [CLINE_CONFIG]: "NOT VALID JSON{{" });
    const adapter = new ClineAdapter();
    expect(adapter.isInstalled()).toBe(false);
  });

  it("install() handles invalid JSON in existing config file gracefully", async () => {
    vol.fromJSON({ [CLINE_CONFIG]: "NOT VALID JSON{{" });
    const adapter = new ClineAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.success).toBe(true);
    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CLINE_CONFIG, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["datasynx-opencrm"]).toBeDefined();
  });

  it("uninstall() handles invalid JSON gracefully", async () => {
    vol.fromJSON({ [CLINE_CONFIG]: "BROKEN{{" });
    const adapter = new ClineAdapter();
    await expect(adapter.uninstall()).resolves.toBeUndefined();
  });
});

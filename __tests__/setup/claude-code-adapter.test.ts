import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";
import os from "os";
import path from "path";

vi.mock("child_process", () => ({
  execSync: vi.fn().mockImplementation(() => {
    throw new Error("not found");
  }),
}));

import { ClaudeCodeAdapter } from "../../src/setup/adapters/claude-code.js";

const HOME = os.homedir();
const CLAUDE_JSON = path.join(HOME, ".claude.json");
const CLAUDE_DIR = path.join(HOME, ".claude");

const TEST_CONFIG = {
  mcpServerPath: "/usr/local/lib/node_modules/datasynx-opencrm/dist/mcp.js",
  dataDir: "/home/user/crm",
  httpPort: 3847,
  serverName: "datasynx-opencrm",
};

beforeEach(() => {
  vol.reset();
});

describe("ClaudeCodeAdapter", () => {
  it("detect() returns true when ~/.claude.json exists", () => {
    vol.fromJSON({ [CLAUDE_JSON]: "{}" });
    const adapter = new ClaudeCodeAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns true when ~/.claude/ dir exists", () => {
    vol.fromJSON({ [`${CLAUDE_DIR}/settings.json`]: "{}" });
    const adapter = new ClaudeCodeAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns false when nothing exists", () => {
    const adapter = new ClaudeCodeAdapter();
    expect(adapter.detect()).toBe(false);
  });

  it("install() creates ~/.claude.json when it doesn't exist", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new ClaudeCodeAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.success).toBe(true);
    expect(result.configPath).toBe(CLAUDE_JSON);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CLAUDE_JSON, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers?.["datasynx-opencrm"]).toBeDefined();
  });

  it("install() deep-merges into existing ~/.claude.json without overwriting other entries", async () => {
    const existing = JSON.stringify({
      mcpServers: {
        "other-server": { command: "other", args: [] },
      },
    });
    vol.fromJSON({
      [CLAUDE_JSON]: existing,
      [TEST_CONFIG.dataDir]: null,
    });

    const adapter = new ClaudeCodeAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CLAUDE_JSON, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["other-server"]).toBeDefined();
    expect(content.mcpServers["datasynx-opencrm"]).toBeDefined();
  });

  it("install() is idempotent — calling twice produces same result", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new ClaudeCodeAdapter();
    await adapter.install(TEST_CONFIG);
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CLAUDE_JSON, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    const keys = Object.keys(content.mcpServers).filter((k) => k === "datasynx-opencrm");
    expect(keys.length).toBe(1);
  });

  it("install() writes CLAUDE.md to dataDir", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new ClaudeCodeAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const claudeMdPath = path.join(TEST_CONFIG.dataDir, "CLAUDE.md");
    expect(fs.existsSync(claudeMdPath)).toBe(true);
    const content = fs.readFileSync(claudeMdPath, "utf-8") as string;
    expect(content).toContain("DatasynxOpenCRM");
    expect(content).toContain("get_customer_context");
  });

  it("install() preserves an existing user CLAUDE.md instead of overwriting it", async () => {
    const claudeMdPath = path.join(TEST_CONFIG.dataDir, "CLAUDE.md");
    const userContent = "# My Project Rules\nNever delete the production database.\n";
    vol.fromJSON({ [claudeMdPath]: userContent });

    const adapter = new ClaudeCodeAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(claudeMdPath, "utf-8") as string;
    // The user's existing content must survive ...
    expect(content).toContain("My Project Rules");
    expect(content).toContain("Never delete the production database.");
    // ... and the CRM guidance is appended, not substituted.
    expect(content).toContain("DatasynxOpenCRM");
  });

  it("install() is idempotent on a CLAUDE.md that already has CRM guidance", async () => {
    const claudeMdPath = path.join(TEST_CONFIG.dataDir, "CLAUDE.md");
    const existing = "# DatasynxOpenCRM — existing guidance\nget_customer_context\n";
    vol.fromJSON({ [claudeMdPath]: existing });

    const adapter = new ClaudeCodeAdapter();
    await adapter.install(TEST_CONFIG);
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(claudeMdPath, "utf-8") as string;
    // Already contains the CRM marker → left untouched, no duplication.
    expect(content).toBe(existing);
  });

  it("install() writes .claude/settings.json with permissions.allow for all 8 tools", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new ClaudeCodeAdapter();
    const result = await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const settingsPath = path.join(TEST_CONFIG.dataDir, ".claude", "settings.json");
    expect(fs.existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8") as string) as {
      permissions: { allow: string[] };
    };
    expect(settings.permissions.allow).toContain("mcp__datasynx-opencrm__get_capabilities");
    expect(settings.permissions.allow).toContain("mcp__datasynx-opencrm__get_customer_context");
    expect(settings.permissions.allow).toContain("mcp__datasynx-opencrm__log_interaction");
    expect(settings.permissions.allow.length).toBe(8);

    // Check harnessFiles contains settings path
    expect(result.harnessFiles).toContain(settingsPath);
  });

  it("install() registers server with process.execPath as command", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new ClaudeCodeAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CLAUDE_JSON, "utf-8") as string) as {
      mcpServers: Record<string, { command: string }>;
    };
    expect(content.mcpServers["datasynx-opencrm"]?.command).toBe(process.execPath);
  });

  it("install() returns correct framework name", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new ClaudeCodeAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.framework).toBe("Claude Code");
    expect(result.transport).toBe("stdio");
  });

  it("uninstall() removes only datasynx-opencrm entry", async () => {
    const existing = JSON.stringify({
      mcpServers: {
        "other-server": { command: "other", args: [] },
        "datasynx-opencrm": { command: process.execPath, args: [] },
      },
    });
    vol.fromJSON({ [CLAUDE_JSON]: existing });

    const adapter = new ClaudeCodeAdapter();
    await adapter.uninstall();

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(CLAUDE_JSON, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["other-server"]).toBeDefined();
    expect(content.mcpServers["datasynx-opencrm"]).toBeUndefined();
  });

  it("isInstalled() returns true when entry exists in ~/.claude.json", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new ClaudeCodeAdapter();
    expect(adapter.isInstalled()).toBe(false);
    await adapter.install(TEST_CONFIG);
    expect(adapter.isInstalled()).toBe(true);
  });

  it("name is 'Claude Code'", () => {
    expect(new ClaudeCodeAdapter().name).toBe("Claude Code");
  });
});

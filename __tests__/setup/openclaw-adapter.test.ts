import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";
import os from "os";
import path from "path";

vi.mock("child_process", () => ({
  execSync: vi.fn().mockImplementation(() => {
    throw new Error("not found");
  }),
}));

import { OpenClawAdapter } from "../../src/setup/adapters/openclaw.js";

const HOME = os.homedir();
const OPENCLAW_DIR = path.join(HOME, ".openclaw");
const OPENCLAW_JSON = path.join(OPENCLAW_DIR, "openclaw.json");
const OPENCLAW_WORKSPACE = path.join(OPENCLAW_DIR, "workspace");

const TEST_CONFIG = {
  mcpServerPath: "/usr/local/lib/node_modules/datasynx-opencrm/dist/mcp.js",
  dataDir: "/home/user/crm",
  httpPort: 3847,
  serverName: "datasynx-opencrm",
};

beforeEach(() => {
  vol.reset();
});

describe("OpenClawAdapter", () => {
  it("detect() returns true when ~/.openclaw/ exists", () => {
    vol.fromJSON({ [`${OPENCLAW_DIR}/.keep`]: "" });
    const adapter = new OpenClawAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns true when openclaw.json exists", () => {
    vol.fromJSON({ [OPENCLAW_JSON]: "{}" });
    const adapter = new OpenClawAdapter();
    expect(adapter.detect()).toBe(true);
  });

  it("detect() returns false when nothing exists", () => {
    const adapter = new OpenClawAdapter();
    expect(adapter.detect()).toBe(false);
  });

  it("install() writes mcpServers to openclaw.json", async () => {
    const adapter = new OpenClawAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(OPENCLAW_JSON, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["datasynx-opencrm"]).toBeDefined();
  });

  it("install() registers both stdio (enabled) and http (disabled) entries", async () => {
    const adapter = new OpenClawAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(OPENCLAW_JSON, "utf-8") as string) as {
      mcpServers: Record<string, { transport?: string; enabled?: boolean }>;
    };
    expect(content.mcpServers["datasynx-opencrm"]?.transport).toBe("stdio");
    expect(content.mcpServers["datasynx-opencrm-http"]?.enabled).toBe(false);
  });

  it("install() creates SOUL.md in workspace", async () => {
    const adapter = new OpenClawAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const soulPath = path.join(OPENCLAW_WORKSPACE, "SOUL.md");
    expect(fs.existsSync(soulPath)).toBe(true);
    const content = fs.readFileSync(soulPath, "utf-8") as string;
    expect(content).toContain("Identity");
    expect(content).toContain("customer");
  });

  it("install() appends to existing SOUL.md without overwriting when CRM marker missing", async () => {
    const existingSoul = "# My Soul\nI am an assistant.";
    vol.fromJSON({
      [path.join(OPENCLAW_WORKSPACE, "SOUL.md")]: existingSoul,
    });

    const adapter = new OpenClawAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(path.join(OPENCLAW_WORKSPACE, "SOUL.md"), "utf-8") as string;
    expect(content).toContain("My Soul");
    expect(content).toContain("DatasynxOpenCRM");
  });

  it("install() does not modify SOUL.md if DatasynxOpenCRM marker already present", async () => {
    const existingSoul = "# Soul with DatasynxOpenCRM already integrated.";
    vol.fromJSON({
      [path.join(OPENCLAW_WORKSPACE, "SOUL.md")]: existingSoul,
    });

    const adapter = new OpenClawAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(path.join(OPENCLAW_WORKSPACE, "SOUL.md"), "utf-8") as string;
    // Should not append again
    const matches = content.match(/DatasynxOpenCRM/g);
    expect(matches?.length).toBe(1);
  });

  it("install() creates AGENTS.md in workspace", async () => {
    const adapter = new OpenClawAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const agentsPath = path.join(OPENCLAW_WORKSPACE, "AGENTS.md");
    expect(fs.existsSync(agentsPath)).toBe(true);
    const content = fs.readFileSync(agentsPath, "utf-8") as string;
    expect(content).toContain("DatasynxOpenCRM");
  });

  it("install() creates TOOLS.md in workspace", async () => {
    const adapter = new OpenClawAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const toolsPath = path.join(OPENCLAW_WORKSPACE, "TOOLS.md");
    expect(fs.existsSync(toolsPath)).toBe(true);
    const content = fs.readFileSync(toolsPath, "utf-8") as string;
    expect(content).toContain("datasynx-opencrm");
  });

  it("install() is idempotent — calling twice produces same mcpServers result", async () => {
    const adapter = new OpenClawAdapter();
    await adapter.install(TEST_CONFIG);
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(OPENCLAW_JSON, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    const keys = Object.keys(content.mcpServers).filter((k) => k === "datasynx-opencrm");
    expect(keys.length).toBe(1);
  });

  it("install() preserves existing mcpServers entries", async () => {
    vol.fromJSON({
      [OPENCLAW_JSON]: JSON.stringify({
        mcpServers: { "other-server": { command: "other" } },
      }),
    });

    const adapter = new OpenClawAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(OPENCLAW_JSON, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["other-server"]).toBeDefined();
    expect(content.mcpServers["datasynx-opencrm"]).toBeDefined();
  });

  it("install() returns correct framework name", async () => {
    const adapter = new OpenClawAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.framework).toBe("OpenClaw");
    expect(result.success).toBe(true);
    expect(result.transport).toBe("stdio");
  });

  it("install() notes mention hot-reload", async () => {
    const adapter = new OpenClawAdapter();
    const result = await adapter.install(TEST_CONFIG);
    expect(result.notes?.toLowerCase()).toContain("hot-reload");
  });

  it("uninstall() removes datasynx-opencrm entries", async () => {
    vol.fromJSON({
      [OPENCLAW_JSON]: JSON.stringify({
        mcpServers: {
          "other-server": { command: "other" },
          "datasynx-opencrm": { command: process.execPath },
          "datasynx-opencrm-http": { url: "http://localhost:3847/mcp" },
        },
      }),
    });

    const adapter = new OpenClawAdapter();
    await adapter.uninstall();

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(OPENCLAW_JSON, "utf-8") as string) as {
      mcpServers: Record<string, unknown>;
    };
    expect(content.mcpServers["other-server"]).toBeDefined();
    expect(content.mcpServers["datasynx-opencrm"]).toBeUndefined();
    expect(content.mcpServers["datasynx-opencrm-http"]).toBeUndefined();
  });

  it("name is 'OpenClaw'", () => {
    expect(new OpenClawAdapter().name).toBe("OpenClaw");
  });

  it("install() appends to AGENTS.md when it exists without DatasynxOpenCRM", async () => {
    vol.fromJSON({
      [path.join(OPENCLAW_WORKSPACE, "AGENTS.md")]: "# Existing agents\nNo CRM here.",
    });
    const adapter = new OpenClawAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(path.join(OPENCLAW_WORKSPACE, "AGENTS.md"), "utf-8") as string;
    expect(content).toContain("DatasynxOpenCRM");
  });

  it("install() appends to TOOLS.md when it exists without datasynx-opencrm", async () => {
    vol.fromJSON({
      [path.join(OPENCLAW_WORKSPACE, "TOOLS.md")]: "# Other tools\nNothing CRM here.",
    });
    const adapter = new OpenClawAdapter();
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(path.join(OPENCLAW_WORKSPACE, "TOOLS.md"), "utf-8") as string;
    expect(content).toContain("datasynx-opencrm");
  });

  it("uninstall() does nothing when config file does not exist", async () => {
    const adapter = new OpenClawAdapter();
    await expect(adapter.uninstall()).resolves.toBeUndefined();
  });

  it("uninstall() handles config with no mcpServers key", async () => {
    vol.fromJSON({ [OPENCLAW_JSON]: JSON.stringify({ someKey: "value" }) });
    const adapter = new OpenClawAdapter();
    await adapter.uninstall();

    const { fs } = await import("memfs");
    const content = JSON.parse(fs.readFileSync(OPENCLAW_JSON, "utf-8") as string) as Record<
      string,
      unknown
    >;
    expect(content["someKey"]).toBe("value");
  });

  it("uninstall() silently ignores invalid JSON in config", async () => {
    vol.fromJSON({ [OPENCLAW_JSON]: "INVALID JSON{{" });
    const adapter = new OpenClawAdapter();
    await expect(adapter.uninstall()).resolves.toBeUndefined();
  });

  it("isInstalled() returns false when config file does not exist", () => {
    const adapter = new OpenClawAdapter();
    expect(adapter.isInstalled()).toBe(false);
  });

  it("isInstalled() returns true when datasynx-opencrm is in mcpServers", () => {
    vol.fromJSON({
      [OPENCLAW_JSON]: JSON.stringify({
        mcpServers: { "datasynx-opencrm": { command: process.execPath } },
      }),
    });
    const adapter = new OpenClawAdapter();
    expect(adapter.isInstalled()).toBe(true);
  });

  it("isInstalled() returns false when datasynx-opencrm is not in mcpServers", () => {
    vol.fromJSON({
      [OPENCLAW_JSON]: JSON.stringify({ mcpServers: { "other-server": {} } }),
    });
    const adapter = new OpenClawAdapter();
    expect(adapter.isInstalled()).toBe(false);
  });

  it("isInstalled() returns false when config has invalid JSON", () => {
    vol.fromJSON({ [OPENCLAW_JSON]: "INVALID JSON{{" });
    const adapter = new OpenClawAdapter();
    expect(adapter.isInstalled()).toBe(false);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";
import os from "os";
import path from "path";

vi.mock("child_process", () => ({
  execSync: vi.fn().mockImplementation(() => {
    throw new Error("not found");
  }),
}));

import { GrokAdapter } from "../../src/setup/adapters/grok.js";

const HOME = os.homedir();
const GROK_DIR = path.join(HOME, ".grok");
const GROK_USER_SETTINGS = path.join(GROK_DIR, "user-settings.json");

const TEST_CONFIG = {
  mcpServerPath: "/usr/local/lib/node_modules/datasynx-opencrm/dist/mcp.js",
  dataDir: "/home/user/crm",
  httpPort: 3847,
  serverName: "datasynx-opencrm",
};

beforeEach(() => {
  vol.reset();
});

describe("GrokAdapter", () => {
  it("name is 'Grok Build'", () => {
    expect(new GrokAdapter().name).toBe("Grok Build");
  });

  it("detect() returns true when ~/.grok/ exists", () => {
    vol.fromJSON({ [`${GROK_DIR}/.keep`]: "" });
    expect(new GrokAdapter().detect()).toBe(true);
  });

  it("detect() returns false when ~/.grok/ does not exist", () => {
    expect(new GrokAdapter().detect()).toBe(false);
  });

  it("isInstalled() returns false before install", () => {
    expect(new GrokAdapter().isInstalled()).toBe(false);
  });

  it("isInstalled() returns true after install", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new GrokAdapter();
    await adapter.install(TEST_CONFIG);
    expect(adapter.isInstalled()).toBe(true);
  });

  it("install() creates ~/.grok/user-settings.json", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    await new GrokAdapter().install(TEST_CONFIG);

    const { fs } = await import("memfs");
    expect(fs.existsSync(GROK_USER_SETTINGS)).toBe(true);
  });

  it("install() writes MCP entry in array format (not map)", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    await new GrokAdapter().install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const raw = fs.readFileSync(GROK_USER_SETTINGS, "utf-8") as string;
    const settings = JSON.parse(raw) as { mcpServers: unknown[] };

    expect(Array.isArray(settings.mcpServers)).toBe(true);
    expect(settings.mcpServers).toHaveLength(1);
  });

  it("install() writes correct MCP entry with stdio transport", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    await new GrokAdapter().install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const raw = fs.readFileSync(GROK_USER_SETTINGS, "utf-8") as string;
    const settings = JSON.parse(raw) as {
      mcpServers: Array<{
        name: string;
        transport: { type: string; args: string[]; env: Record<string, string> };
      }>;
    };

    const entry = settings.mcpServers[0]!;
    expect(entry.name).toBe("datasynx-opencrm");
    expect(entry.transport.type).toBe("stdio");
    expect(entry.transport.args).toContain(TEST_CONFIG.mcpServerPath);
    expect(entry.transport.env["DXCRM_DATA_DIR"]).toBe(TEST_CONFIG.dataDir);
  });

  it("install() merges into existing user-settings.json without clobbering other keys", async () => {
    vol.fromJSON({
      [TEST_CONFIG.dataDir]: null,
      [GROK_USER_SETTINGS]: JSON.stringify({
        apiKey: "xai-existing",
        mcpServers: [{ name: "other-server", transport: { type: "stdio" } }],
      }),
    });

    await new GrokAdapter().install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const settings = JSON.parse(fs.readFileSync(GROK_USER_SETTINGS, "utf-8") as string) as {
      apiKey: string;
      mcpServers: Array<{ name: string }>;
    };

    expect(settings.apiKey).toBe("xai-existing");
    expect(settings.mcpServers).toHaveLength(2);
    expect(settings.mcpServers.map((s) => s.name)).toContain("other-server");
    expect(settings.mcpServers.map((s) => s.name)).toContain("datasynx-opencrm");
  });

  it("install() is idempotent — calling twice does not duplicate MCP entry", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const adapter = new GrokAdapter();
    await adapter.install(TEST_CONFIG);
    await adapter.install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const settings = JSON.parse(fs.readFileSync(GROK_USER_SETTINGS, "utf-8") as string) as {
      mcpServers: unknown[];
    };
    expect(settings.mcpServers).toHaveLength(1);
  });

  it("install() writes .grok/settings.json into dataDir", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    await new GrokAdapter().install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const projectSettings = path.join(TEST_CONFIG.dataDir, ".grok", "settings.json");
    expect(fs.existsSync(projectSettings)).toBe(true);

    const content = JSON.parse(fs.readFileSync(projectSettings, "utf-8") as string) as {
      mcpServers: Array<{ name: string; transport: { type: string } }>;
    };
    expect(Array.isArray(content.mcpServers)).toBe(true);
    expect(content.mcpServers[0]!.name).toBe("datasynx-opencrm");
    expect(content.mcpServers[0]!.transport.type).toBe("stdio");
  });

  it("install() writes AGENTS.md to dataDir", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const result = await new GrokAdapter().install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const agentsPath = path.join(TEST_CONFIG.dataDir, "AGENTS.md");
    expect(fs.existsSync(agentsPath)).toBe(true);
    expect(fs.readFileSync(agentsPath, "utf-8") as string).toContain("DatasynxOpenCRM");
    expect(result.harnessFiles).toContain(agentsPath);
  });

  it("install() does not overwrite AGENTS.md that already has CRM content", async () => {
    const existing = "# DatasynxOpenCRM Agent\nAlready configured.";
    vol.fromJSON({
      [TEST_CONFIG.dataDir]: null,
      [path.join(TEST_CONFIG.dataDir, "AGENTS.md")]: existing,
    });

    await new GrokAdapter().install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(
      path.join(TEST_CONFIG.dataDir, "AGENTS.md"),
      "utf-8"
    ) as string;
    expect((content.match(/DatasynxOpenCRM/g) ?? []).length).toBe(1);
  });

  it("install() appends to AGENTS.md if it lacks CRM content", async () => {
    vol.fromJSON({
      [TEST_CONFIG.dataDir]: null,
      [path.join(TEST_CONFIG.dataDir, "AGENTS.md")]: "# Other Agents\nExisting content.",
    });

    await new GrokAdapter().install(TEST_CONFIG);

    const { fs } = await import("memfs");
    const content = fs.readFileSync(
      path.join(TEST_CONFIG.dataDir, "AGENTS.md"),
      "utf-8"
    ) as string;
    expect(content).toContain("Other Agents");
    expect(content).toContain("DatasynxOpenCRM");
  });

  it("install() returns correct metadata", async () => {
    vol.fromJSON({ [TEST_CONFIG.dataDir]: null });
    const result = await new GrokAdapter().install(TEST_CONFIG);

    expect(result.framework).toBe("Grok Build");
    expect(result.success).toBe(true);
    expect(result.transport).toBe("stdio");
    expect(result.configPath).toBe(GROK_USER_SETTINGS);
    expect(result.notes).toContain("user-settings.json");
  });

  it("uninstall() removes only the datasynx-opencrm entry from mcpServers array", async () => {
    vol.fromJSON({
      [GROK_USER_SETTINGS]: JSON.stringify({
        mcpServers: [
          { name: "other-server", transport: { type: "stdio" } },
          { name: "datasynx-opencrm", transport: { type: "stdio" } },
        ],
      }),
    });

    await new GrokAdapter().uninstall();

    const { fs } = await import("memfs");
    const settings = JSON.parse(fs.readFileSync(GROK_USER_SETTINGS, "utf-8") as string) as {
      mcpServers: Array<{ name: string }>;
    };
    expect(settings.mcpServers).toHaveLength(1);
    expect(settings.mcpServers[0]!.name).toBe("other-server");
  });

  it("uninstall() is a no-op when file does not exist", async () => {
    await expect(new GrokAdapter().uninstall()).resolves.toBeUndefined();
  });
});

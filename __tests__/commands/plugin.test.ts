import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/core/plugin-registry.js", () => ({
  listPlugins: vi.fn().mockReturnValue([]),
  getPlugin: vi.fn().mockReturnValue(undefined),
  registerPlugin: vi.fn(),
  unregisterPlugin: vi.fn(),
}));

import { listPlugins, getPlugin } from "../../src/core/plugin-registry.js";

const mockList = vi.mocked(listPlugins);
const mockGet = vi.mocked(getPlugin);

const samplePlugin = {
  name: "slack",
  version: "1.0.0",
  description: "Slack notifications for CRM events",
  mcpTools: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockReturnValue([]);
  mockGet.mockReturnValue(undefined);
});

describe("pluginCommand — Commander structure", () => {
  it("exports pluginCommand with name 'plugin'", async () => {
    const { pluginCommand } = await import("../../src/commands/plugin.js");
    expect(pluginCommand.name()).toBe("plugin");
  });

  it("has 'list' subcommand", async () => {
    const { pluginCommand } = await import("../../src/commands/plugin.js");
    const names = pluginCommand.commands.map((c) => c.name());
    expect(names).toContain("list");
  });

  it("has 'info' subcommand", async () => {
    const { pluginCommand } = await import("../../src/commands/plugin.js");
    const names = pluginCommand.commands.map((c) => c.name());
    expect(names).toContain("info");
  });
});

describe("plugin list", () => {
  it("shows 'No plugins registered' when empty", async () => {
    mockList.mockReturnValue([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { pluginCommand } = await import("../../src/commands/plugin.js");
    await pluginCommand.parseAsync(["node", "dxcrm", "list"]);
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/no plugins/i);
    logSpy.mockRestore();
  });

  it("displays plugin name, version and description", async () => {
    mockList.mockReturnValue([samplePlugin]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { pluginCommand } = await import("../../src/commands/plugin.js");
    await pluginCommand.parseAsync(["node", "dxcrm", "list"]);
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("slack");
    expect(output).toContain("1.0.0");
    expect(output).toContain("Slack notifications");
    logSpy.mockRestore();
  });

  it("shows count in header for multiple plugins", async () => {
    mockList.mockReturnValue([
      samplePlugin,
      { name: "stripe", version: "1.0.0", description: "Stripe plugin", mcpTools: ["get_stripe_context"] },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { pluginCommand } = await import("../../src/commands/plugin.js");
    await pluginCommand.parseAsync(["node", "dxcrm", "list"]);
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("2");
    logSpy.mockRestore();
  });
});

describe("plugin info", () => {
  it("displays plugin details when found", async () => {
    mockGet.mockReturnValue({
      name: "stripe",
      version: "2.0.0",
      description: "Stripe plugin",
      mcpTools: ["get_stripe_context"],
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { pluginCommand } = await import("../../src/commands/plugin.js");
    await pluginCommand.parseAsync(["node", "dxcrm", "info", "stripe"]);
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("stripe");
    expect(output).toContain("2.0.0");
    expect(output).toContain("get_stripe_context");
    logSpy.mockRestore();
  });

  it("calls process.exit(1) when plugin not found", async () => {
    mockGet.mockReturnValue(undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const errSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { pluginCommand } = await import("../../src/commands/plugin.js");
    await expect(pluginCommand.parseAsync(["node", "dxcrm", "info", "unknown"])).rejects.toThrow("exit");
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});

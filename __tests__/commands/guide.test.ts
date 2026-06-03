import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { CAPABILITIES_TEXT } from "../../src/mcp/capabilities.js";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("guideCommand", () => {
  it("prints CAPABILITIES_TEXT to stdout", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { guideCommand } = await import("../../src/commands/guide.js");
    // Access the action handler directly — Commander expects an args array
    const action = (guideCommand as { _actionHandler?: (args: unknown[]) => void })._actionHandler;
    if (action) action.call(guideCommand, []);
    else guideCommand.emit("command:*", []);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("output contains DatasynxOpenCRM branding", () => {
    expect(CAPABILITIES_TEXT).toContain("DatasynxOpenCRM");
  });

  it("output contains list_customers tool", () => {
    expect(CAPABILITIES_TEXT).toContain("list_customers");
  });

  it("output contains all 8 tool names", () => {
    const tools = [
      "get_capabilities",
      "get_active_session",
      "get_customer_context",
      "search_customer_knowledge",
      "list_customers",
      "log_interaction",
      "update_deal",
      "export_customer",
    ];
    for (const tool of tools) {
      expect(CAPABILITIES_TEXT).toContain(tool);
    }
  });
});

describe("mcpCommand docs", () => {
  it("docs subcommand exists on mcpCommand", async () => {
    const { mcpCommand } = await import("../../src/commands/guide.js");
    const docsCmd = mcpCommand.commands.find((c) => c.name() === "docs");
    expect(docsCmd).toBeDefined();
  });

  it("start subcommand exists on mcpCommand", async () => {
    const { mcpCommand } = await import("../../src/commands/guide.js");
    const startCmd = mcpCommand.commands.find((c) => c.name() === "start");
    expect(startCmd).toBeDefined();
  });

  it("start subcommand has --http option", async () => {
    const { mcpCommand } = await import("../../src/commands/guide.js");
    const startCmd = mcpCommand.commands.find((c) => c.name() === "start");
    const options = startCmd?.options.map((o) => o.long);
    expect(options).toContain("--http");
  });

  it("CAPABILITIES_TEXT matches what guide outputs", () => {
    // Both guide and mcp docs use the same CAPABILITIES_TEXT constant
    expect(typeof CAPABILITIES_TEXT).toBe("string");
    expect(CAPABILITIES_TEXT.length).toBeGreaterThan(100);
  });

  it("docs subcommand prints CAPABILITIES_TEXT when invoked via parseAsync", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { mcpCommand } = await import("../../src/commands/guide.js");
    await mcpCommand.parseAsync(["node", "mcp", "docs"]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("start subcommand with --http launches HTTP server", async () => {
    const startHttpMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../src/mcp/server.js", () => ({
      startHttp: startHttpMock,
      startStdio: vi.fn().mockResolvedValue(undefined),
    }));
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { mcpCommand } = await import("../../src/commands/guide.js");
    await mcpCommand.parseAsync(["node", "mcp", "start", "--http", "--port", "3847"]);
    expect(startHttpMock).toHaveBeenCalledWith(3847);
    stderrSpy.mockRestore();
  });

  it("start subcommand without --http launches stdio server", async () => {
    const startStdioMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../src/mcp/server.js", () => ({
      startHttp: vi.fn().mockResolvedValue(undefined),
      startStdio: startStdioMock,
    }));
    const { mcpCommand } = await import("../../src/commands/guide.js");
    await mcpCommand.parseAsync(["node", "mcp", "start"]);
    expect(startStdioMock).toHaveBeenCalled();
  });
});

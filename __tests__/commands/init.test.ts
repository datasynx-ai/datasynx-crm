import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/setup/framework-registry.js", () => ({
  installAllDetected: vi.fn().mockResolvedValue([]),
}));

vi.mock("os", () => ({
  default: {
    homedir: () => "/home/testuser",
  },
  homedir: () => "/home/testuser",
}));

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
  process.env["DXCRM_DATA_DIR"] = "/crm";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env["DXCRM_DATA_DIR"];
});

describe("initCommand", () => {
  it("creates .agentic/ directory and config.json", async () => {
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    expect(vol.existsSync(`/crm/.agentic/config.json`)).toBe(true);
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("honors DXCRM_DATA_DIR over the current working directory", async () => {
    process.env["DXCRM_DATA_DIR"] = "/custom-vault";
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    // Initialized in the configured vault, NOT in cwd.
    expect(vol.existsSync("/custom-vault/.agentic/config.json")).toBe(true);
    expect(vol.existsSync(`${process.cwd()}/.agentic/config.json`)).toBe(false);
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("creates sources.json with gmail disabled by default", async () => {
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    const sourcesPath = `/crm/.agentic/sources.json`;
    expect(vol.existsSync(sourcesPath)).toBe(true);
    const sources = JSON.parse(vol.readFileSync(sourcesPath, "utf-8") as string) as {
      gmail: { enabled: boolean };
    };
    expect(sources.gmail.enabled).toBe(false);
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("creates customers/ directory", async () => {
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    expect(vol.existsSync(`/crm/customers`)).toBe(true);
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("shows success message with detected frameworks", async () => {
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([
      { framework: "claude-code", success: true, transport: "stdio" },
    ]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("claude-code");
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("shows failed framework when install fails", async () => {
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([
      { framework: "cursor", success: false, transport: "stdio", notes: "config not found" },
    ]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("cursor");
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("shows no-framework message when none detected", async () => {
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("No AI frameworks detected");
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("shows team server info when --team flag is provided", async () => {
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init", "--team", "http://vm-ip:3847/mcp"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("http://vm-ip:3847/mcp");
    expect(output).toContain("DXCRM_ACTOR");
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("does not overwrite existing config.json", async () => {
    const existingConfig = { version: 1, existing: true };
    vol.fromJSON({
      [`/crm/.agentic/config.json`]: JSON.stringify(existingConfig),
    });
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    const config = JSON.parse(vol.readFileSync(`/crm/.agentic/config.json`, "utf-8") as string) as {
      existing?: boolean;
    };
    expect(config.existing).toBe(true); // preserved
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });
});

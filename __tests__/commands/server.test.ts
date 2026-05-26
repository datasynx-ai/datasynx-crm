import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { vol } from "memfs";

vi.mock("child_process", () => ({
  spawn: vi.fn().mockReturnValue({ pid: 12345, unref: vi.fn() }),
}));

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  // clean up env var side effects
  delete process.env["DXCRM_DATA_DIR"];
});

describe("runServerStart", () => {
  it("writes PID file to .agentic/server.pid in data dir", async () => {
    const { spawn } = await import("child_process");
    vi.mocked(spawn).mockReturnValue({ pid: 12345, unref: vi.fn() } as never);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { runServerStart } = await import("../../src/commands/server.js");
    await runServerStart({ port: "3847", data: "/mnt/crm-data" });

    const pidContent = vol.readFileSync("/mnt/crm-data/.agentic/server.pid", "utf-8");
    expect(pidContent).toBe("12345");

    consoleSpy.mockRestore();
  });

  it("prints server URL and data dir on start", async () => {
    const { spawn } = await import("child_process");
    vi.mocked(spawn).mockReturnValue({ pid: 99, unref: vi.fn() } as never);

    const logMessages: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logMessages.push(args.join(" "));
    });

    const { runServerStart } = await import("../../src/commands/server.js");
    await runServerStart({ port: "3847", data: "/mnt/crm-data" });

    const output = logMessages.join("\n");
    expect(output).toMatch(/http:\/\/0\.0\.0\.0:3847\/mcp/);
    expect(output).toMatch(/\/mnt\/crm-data/);
    expect(output).toMatch(/:3847\/mcp/);

    consoleSpy.mockRestore();
  });

  it("prints framework config hint with hostname", async () => {
    const { spawn } = await import("child_process");
    vi.mocked(spawn).mockReturnValue({ pid: 42, unref: vi.fn() } as never);

    const logMessages: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logMessages.push(args.join(" "));
    });

    const { runServerStart } = await import("../../src/commands/server.js");
    await runServerStart({ port: "3847", data: "/mnt/crm-data" });

    const output = logMessages.join("\n");
    expect(output).toMatch(/url:/);
    expect(output).toMatch(/:3847\/mcp/);

    consoleSpy.mockRestore();
  });

  it("sets DXCRM_DATA_DIR env var when --data is provided", async () => {
    const { spawn } = await import("child_process");
    vi.mocked(spawn).mockReturnValue({ pid: 55, unref: vi.fn() } as never);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { runServerStart } = await import("../../src/commands/server.js");
    await runServerStart({ port: "3847", data: "/mnt/crm-data" });

    expect(process.env["DXCRM_DATA_DIR"]).toBe("/mnt/crm-data");

    consoleSpy.mockRestore();
  });

  it("uses custom port when --port is provided", async () => {
    const { spawn } = await import("child_process");
    vi.mocked(spawn).mockReturnValue({ pid: 77, unref: vi.fn() } as never);

    const logMessages: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logMessages.push(args.join(" "));
    });

    const { runServerStart } = await import("../../src/commands/server.js");
    await runServerStart({ port: "4000", data: "/mnt/data" });

    const output = logMessages.join("\n");
    expect(output).toMatch(/4000/);

    consoleSpy.mockRestore();
  });

  it("shows 'already running' when PID file exists and process is alive", async () => {
    // Pre-populate PID file with a PID we'll mock as alive
    vol.fromJSON({ "/mnt/crm-data/.agentic/server.pid": "99999" });

    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const logMessages: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logMessages.push(args.join(" "));
    });

    const { runServerStart } = await import("../../src/commands/server.js");
    await runServerStart({ port: "3847", data: "/mnt/crm-data" });

    const output = logMessages.join("\n");
    expect(output).toMatch(/already running/i);

    killSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

describe("runServerStatus", () => {
  it("shows 'not running' when no PID file exists", async () => {
    vol.fromJSON({});

    const logMessages: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logMessages.push(args.join(" "));
    });

    const { runServerStatus } = await import("../../src/commands/server.js");
    runServerStatus("/mnt/crm-data");

    const output = logMessages.join("\n");
    expect(output).toMatch(/not running/i);

    consoleSpy.mockRestore();
  });

  it("shows 'running' with PID when PID file exists and process is alive", async () => {
    vol.fromJSON({ "/mnt/crm-data/.agentic/server.pid": "12345" });

    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const logMessages: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logMessages.push(args.join(" "));
    });

    const { runServerStatus } = await import("../../src/commands/server.js");
    runServerStatus("/mnt/crm-data");

    const output = logMessages.join("\n");
    expect(output).toMatch(/running/i);
    expect(output).toMatch(/12345/);

    killSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("shows 'not running' when PID file exists but process is dead (stale)", async () => {
    vol.fromJSON({ "/mnt/crm-data/.agentic/server.pid": "99999" });

    // Simulate dead process — kill throws
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("no such process");
    });

    const logMessages: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logMessages.push(args.join(" "));
    });

    const { runServerStatus } = await import("../../src/commands/server.js");
    runServerStatus("/mnt/crm-data");

    const output = logMessages.join("\n");
    expect(output).toMatch(/not running/i);

    killSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("removes stale PID file when process is dead", async () => {
    vol.fromJSON({ "/mnt/crm-data/.agentic/server.pid": "99999" });

    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("no such process");
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { runServerStatus } = await import("../../src/commands/server.js");
    runServerStatus("/mnt/crm-data");

    expect(vol.existsSync("/mnt/crm-data/.agentic/server.pid")).toBe(false);

    killSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

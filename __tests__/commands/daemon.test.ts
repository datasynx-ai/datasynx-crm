import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockSpawn = vi.hoisted(() => vi.fn());

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

vi.mock("child_process", () => ({
  spawn: mockSpawn,
}));

const DATA_DIR = "/cwd";

describe("daemonCommand start", () => {
  let originalCwd: () => string;
  let killSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    originalCwd = process.cwd;
    process.cwd = () => DATA_DIR;
    killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    mockSpawn.mockReturnValue({ pid: 42_000, unref: vi.fn() });
  });

  afterEach(() => {
    process.cwd = originalCwd;
    killSpy.mockRestore();
  });

  it("spawns worker and writes pid file", async () => {
    vol.fromJSON({});
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { daemonCommand } = await import("../../src/commands/daemon.js");
    await daemonCommand.parseAsync(["node", "daemon", "start"]);

    expect(mockSpawn).toHaveBeenCalled();
    const { fs } = vol;
    expect(fs.existsSync(`${DATA_DIR}/.agentic/daemon.pid`)).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("42000"));
    consoleSpy.mockRestore();
  });

  it("skips spawn when daemon already running (pid file + live pid)", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/daemon.pid`]: "99999" });
    // process.kill(pid, 0) succeeds → daemon is running
    killSpy.mockImplementation((pid: number, sig: number | string) => {
      if (sig === 0) return true;
      return true;
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { daemonCommand } = await import("../../src/commands/daemon.js");
    await daemonCommand.parseAsync(["node", "daemon", "start"]);

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("already running"));
    consoleSpy.mockRestore();
  });

  it("spawns when pid file is stale (process does not exist)", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/daemon.pid`]: "99998" });
    // process.kill(pid, 0) throws → pid is stale
    killSpy.mockImplementation((pid: number, sig: number | string) => {
      if (sig === 0) throw new Error("No such process");
      return true;
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { daemonCommand } = await import("../../src/commands/daemon.js");
    await daemonCommand.parseAsync(["node", "daemon", "start"]);

    expect(mockSpawn).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("daemonCommand stop", () => {
  let originalCwd: () => string;
  let killSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    originalCwd = process.cwd;
    process.cwd = () => DATA_DIR;
    killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
  });

  afterEach(() => {
    process.cwd = originalCwd;
    killSpy.mockRestore();
  });

  it("sends SIGTERM and removes pid file", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/daemon.pid`]: "77777" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { daemonCommand } = await import("../../src/commands/daemon.js");
    await daemonCommand.parseAsync(["node", "daemon", "stop"]);

    expect(killSpy).toHaveBeenCalledWith(77777, "SIGTERM");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("stopped"));
    const { fs } = vol;
    expect(fs.existsSync(`${DATA_DIR}/.agentic/daemon.pid`)).toBe(false);
    consoleSpy.mockRestore();
  });

  it("logs info when no pid file exists", async () => {
    vol.fromJSON({});
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { daemonCommand } = await import("../../src/commands/daemon.js");
    await daemonCommand.parseAsync(["node", "daemon", "stop"]);

    expect(killSpy).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("not running"));
    consoleSpy.mockRestore();
  });
});

describe("daemonCommand status", () => {
  let originalCwd: () => string;
  let killSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    originalCwd = process.cwd;
    process.cwd = () => DATA_DIR;
    killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
  });

  afterEach(() => {
    process.cwd = originalCwd;
    killSpy.mockRestore();
  });

  it("shows running status when pid is alive", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/daemon.pid`]: "55555" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { daemonCommand } = await import("../../src/commands/daemon.js");
    await daemonCommand.parseAsync(["node", "daemon", "status"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("running"));
    consoleSpy.mockRestore();
  });

  it("shows stopped status when pid file is stale", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/daemon.pid`]: "55556" });
    killSpy.mockImplementation(() => {
      throw new Error("No such process");
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { daemonCommand } = await import("../../src/commands/daemon.js");
    await daemonCommand.parseAsync(["node", "daemon", "status"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("stale"));
    consoleSpy.mockRestore();
  });

  it("shows not running when no pid file", async () => {
    vol.fromJSON({});
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { daemonCommand } = await import("../../src/commands/daemon.js");
    await daemonCommand.parseAsync(["node", "daemon", "status"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("not running"));
    consoleSpy.mockRestore();
  });
});

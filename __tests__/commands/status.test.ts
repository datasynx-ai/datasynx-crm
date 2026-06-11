import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { vol } from "memfs";

const mockGetSession = vi.hoisted(() => vi.fn().mockReturnValue(null));

vi.mock("../../src/core/session-store.js", () => ({
  getSession: mockGetSession,
  setSession: vi.fn(),
  clearSession: vi.fn(),
  readSession: vi.fn().mockReturnValue(null),
}));

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
  mockGetSession.mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runStatus — daemon state", () => {
  it("shows 'not running' when no PID file exists", async () => {
    vol.fromJSON({});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/not running/i);
    logSpy.mockRestore();
  });

  it("shows PID when daemon is running", async () => {
    vol.fromJSON({ "/data/.agentic/daemon.pid": "99999" });
    // Mock process.kill to not throw (simulating process exists)
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/99999/);
    killSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe("runStatus — customer counts", () => {
  it("shows customer count from customers/ directory", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": "---\nname: Acme\n---\n",
      "/data/customers/beta-gmbh/main_facts.md": "---\nname: Beta\n---\n",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/2/);
    logSpy.mockRestore();
  });

  it("shows 0 customers when customers/ does not exist", async () => {
    vol.fromJSON({});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/0/);
    logSpy.mockRestore();
  });
});

describe("runStatus — sync state", () => {
  it("shows sync age from sync-state.json", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": "---\nname: Acme\n---\n",
      "/data/.agentic/sync-state.json": JSON.stringify({
        "acme-corp": { lastGmailSync: twoHoursAgo },
      }),
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/acme-corp/);
    expect(output).toMatch(/2h ago/);
    logSpy.mockRestore();
  });

  it("shows 'no sync yet' when customer has no sync entry", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": "---\nname: Acme\n---\n",
      "/data/.agentic/sync-state.json": JSON.stringify({}),
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/no sync yet/i);
    logSpy.mockRestore();
  });
});

describe("runStatus — unmatched", () => {
  it("shows unmatched transcript count", async () => {
    vol.fromJSON({
      "/data/.agentic/unmatched-transcripts.json": JSON.stringify([
        { filePath: "/t/a.vtt", addedAt: "2026-01-01T00:00:00.000Z", reason: "no_customer_match" },
        { filePath: "/t/b.vtt", addedAt: "2026-01-01T00:00:00.000Z", reason: "no_customer_match" },
      ]),
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/2 Transcript/);
    logSpy.mockRestore();
  });

  it("--unmatched flag lists transcript paths", async () => {
    vol.fromJSON({
      "/data/.agentic/unmatched-transcripts.json": JSON.stringify([
        {
          filePath: "/transcripts/meeting.vtt",
          addedAt: "2026-01-01T00:00:00.000Z",
          reason: "no_customer_match",
        },
      ]),
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({ unmatched: true }, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/meeting\.vtt/);
    logSpy.mockRestore();
  });

  it("--unmatched shows empty message when queue is empty", async () => {
    vol.fromJSON({});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({ unmatched: true }, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/no unmatched|empty|0/i);
    logSpy.mockRestore();
  });
});

// ─── team overview via --team ─────────────────────────────────────────────────

describe("runStatus — team overview", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows team sessions when server returns sessions", async () => {
    vol.fromJSON({});
    const sessions = [
      {
        customerSlug: "acme-corp",
        customerName: "Acme Corp",
        owner: "alice",
        startedAt: "2026-05-28T10:00:00Z",
      },
      {
        customerSlug: "beta-gmbh",
        customerName: "Beta GmbH",
        owner: "bob",
        startedAt: "2026-05-28T11:00:00Z",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sessions }),
      })
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({ team: "http://localhost:3847" }, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("alice");
    expect(output).toContain("Acme Corp");
    expect(output).toContain("bob");
    logSpy.mockRestore();
  });

  it("shows 'no active sessions' when server returns empty list", async () => {
    vol.fromJSON({});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sessions: [] }),
      })
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({ team: "http://localhost:3847" }, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/no active sessions/i);
    logSpy.mockRestore();
  });

  it("shows server unreachable message when fetch fails", async () => {
    vol.fromJSON({});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({ team: "http://localhost:9999" }, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/unreachable/i);
    logSpy.mockRestore();
  });

  it("shows team sessions from DXCRM_SERVER_URL env when --team not passed", async () => {
    process.env["DXCRM_SERVER_URL"] = "http://localhost:3847";
    vol.fromJSON({});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sessions: [] }),
      })
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/no active sessions/i);
    logSpy.mockRestore();
    delete process.env["DXCRM_SERVER_URL"];
  });
});

describe("runStatus — session display", () => {
  it("shows session info with owner when a session is active", async () => {
    mockGetSession.mockReturnValue({
      customerSlug: "acme-corp",
      customerName: "Acme Corp",
      owner: "alice",
      startedAt: "2026-05-01T00:00:00Z",
    });
    vol.fromJSON({});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Acme Corp");
    expect(output).toContain("alice");
    logSpy.mockRestore();
  });

  it("shows session info without owner bracket when session has no owner", async () => {
    mockGetSession.mockReturnValue({
      customerSlug: "beta",
      customerName: "Beta Corp",
      startedAt: "2026-05-01T00:00:00Z",
    });
    vol.fromJSON({});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runStatus } = await import("../../src/commands/status.js");
    await runStatus({}, "/data");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Beta Corp");
    logSpy.mockRestore();
  });
});

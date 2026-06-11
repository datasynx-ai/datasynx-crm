import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/fs/audit-log.js", () => ({
  readAuditLog: vi.fn().mockReturnValue([]),
  filterAuditLog: vi.fn((entries: unknown[], opts: { limit?: number }) => {
    // Default mock passes through, respects limit
    const limit = opts.limit ?? 20;
    return (entries as unknown[]).slice(-limit);
  }),
  writeAuditEntry: vi.fn(),
  getActor: vi.fn().mockReturnValue("system"),
}));

import { readAuditLog, filterAuditLog } from "../../src/fs/audit-log.js";

const mockReadAuditLog = vi.mocked(readAuditLog);
const mockFilterAuditLog = vi.mocked(filterAuditLog);

const sampleEntries = [
  {
    timestamp: "2026-06-01T08:00:00.000Z",
    actor: "alice",
    tool: "log_interaction",
    slug: "acme-corp",
    summary: "First call",
  },
  {
    timestamp: "2026-06-02T09:00:00.000Z",
    actor: "bob",
    tool: "update_deal",
    slug: "beta-inc",
    summary: "Deal updated",
  },
];

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  mockReadAuditLog.mockReturnValue([]);
  mockFilterAuditLog.mockImplementation((entries, opts) => {
    const limit = opts.limit ?? 20;
    return entries.slice(-limit);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAudit — basic output", () => {
  it("shows 'No audit entries' when log is empty", async () => {
    mockReadAuditLog.mockReturnValue([]);
    mockFilterAuditLog.mockReturnValue([]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAudit } = await import("../../src/commands/audit.js");
    await runAudit({}, "/data");

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/no audit entries|empty/i);
    logSpy.mockRestore();
  });

  it("displays entries with timestamp, actor, tool, slug and summary", async () => {
    mockReadAuditLog.mockReturnValue(sampleEntries);
    mockFilterAuditLog.mockReturnValue(sampleEntries);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAudit } = await import("../../src/commands/audit.js");
    await runAudit({}, "/data");

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("alice");
    expect(output).toContain("log_interaction");
    expect(output).toContain("acme-corp");
    expect(output).toContain("First call");
    logSpy.mockRestore();
  });

  it("calls readAuditLog with the provided dataDir", async () => {
    mockReadAuditLog.mockReturnValue([]);
    mockFilterAuditLog.mockReturnValue([]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAudit } = await import("../../src/commands/audit.js");
    await runAudit({}, "/custom-dir");

    expect(mockReadAuditLog).toHaveBeenCalledWith("/custom-dir");
    logSpy.mockRestore();
  });
});

describe("runAudit — filtering", () => {
  it("passes slug to filterAuditLog when --slug is provided", async () => {
    mockReadAuditLog.mockReturnValue(sampleEntries);
    mockFilterAuditLog.mockReturnValue([sampleEntries[0]!]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAudit } = await import("../../src/commands/audit.js");
    await runAudit({ slug: "acme-corp" }, "/data");

    expect(mockFilterAuditLog).toHaveBeenCalledWith(
      sampleEntries,
      expect.objectContaining({ slug: "acme-corp" })
    );
    logSpy.mockRestore();
  });

  it("passes actor to filterAuditLog when --actor is provided", async () => {
    mockReadAuditLog.mockReturnValue(sampleEntries);
    mockFilterAuditLog.mockReturnValue([sampleEntries[0]!]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAudit } = await import("../../src/commands/audit.js");
    await runAudit({ actor: "alice" }, "/data");

    expect(mockFilterAuditLog).toHaveBeenCalledWith(
      sampleEntries,
      expect.objectContaining({ actor: "alice" })
    );
    logSpy.mockRestore();
  });

  it("passes limit to filterAuditLog when --limit is provided", async () => {
    mockReadAuditLog.mockReturnValue(sampleEntries);
    mockFilterAuditLog.mockReturnValue(sampleEntries);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAudit } = await import("../../src/commands/audit.js");
    await runAudit({ limit: 50 }, "/data");

    expect(mockFilterAuditLog).toHaveBeenCalledWith(
      sampleEntries,
      expect.objectContaining({ limit: 50 })
    );
    logSpy.mockRestore();
  });

  it("defaults to limit 20 when no --limit provided", async () => {
    mockReadAuditLog.mockReturnValue(sampleEntries);
    mockFilterAuditLog.mockReturnValue(sampleEntries);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAudit } = await import("../../src/commands/audit.js");
    await runAudit({}, "/data");

    expect(mockFilterAuditLog).toHaveBeenCalledWith(
      sampleEntries,
      expect.objectContaining({ limit: 20 })
    );
    logSpy.mockRestore();
  });
});

describe("runAudit — --tail flag", () => {
  it("shows all entries when --tail is provided (simplified implementation)", async () => {
    mockReadAuditLog.mockReturnValue(sampleEntries);
    mockFilterAuditLog.mockReturnValue(sampleEntries);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAudit } = await import("../../src/commands/audit.js");
    await runAudit({ tail: true }, "/data");

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("alice");
    expect(output).toContain("bob");
    logSpy.mockRestore();
  });
});

describe("auditCommand — Commander integration", () => {
  it("exports auditCommand as a Commander Command", async () => {
    const { auditCommand } = await import("../../src/commands/audit.js");
    expect(auditCommand).toBeDefined();
    expect(auditCommand.name()).toBe("audit");
  });

  it("auditCommand has --slug option", async () => {
    const { auditCommand } = await import("../../src/commands/audit.js");
    const options = auditCommand.options.map((o) => o.long);
    expect(options).toContain("--slug");
  });

  it("auditCommand has --actor option", async () => {
    const { auditCommand } = await import("../../src/commands/audit.js");
    const options = auditCommand.options.map((o) => o.long);
    expect(options).toContain("--actor");
  });

  it("auditCommand has --limit option", async () => {
    const { auditCommand } = await import("../../src/commands/audit.js");
    const options = auditCommand.options.map((o) => o.long);
    expect(options).toContain("--limit");
  });

  it("auditCommand has --tail option", async () => {
    const { auditCommand } = await import("../../src/commands/audit.js");
    const options = auditCommand.options.map((o) => o.long);
    expect(options).toContain("--tail");
  });
});

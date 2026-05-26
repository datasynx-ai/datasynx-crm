import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";
// fs is globally mocked via setup.ts — do NOT re-mock here

beforeEach(() => {
  vol.reset();
  delete process.env["DXCRM_ACTOR"];
});

afterEach(() => {
  delete process.env["DXCRM_ACTOR"];
});

describe("getActor", () => {
  it("returns DXCRM_ACTOR env var when set", async () => {
    process.env["DXCRM_ACTOR"] = "alice";
    const { getActor } = await import("../../src/fs/audit-log.js");
    expect(getActor()).toBe("alice");
  });

  it("falls back to 'system' when DXCRM_ACTOR is not set", async () => {
    delete process.env["DXCRM_ACTOR"];
    const { getActor } = await import("../../src/fs/audit-log.js");
    expect(getActor()).toBe("system");
  });

  it("falls back to 'system' when DXCRM_ACTOR is empty string", async () => {
    process.env["DXCRM_ACTOR"] = "";
    const { getActor } = await import("../../src/fs/audit-log.js");
    expect(getActor()).toBe("system");
  });
});

describe("writeAuditEntry", () => {
  it("creates .agentic/audit.log when it does not exist", async () => {
    vol.fromJSON({ "/data/.agentic/": null });
    const { writeAuditEntry } = await import("../../src/fs/audit-log.js");

    writeAuditEntry("/data", {
      timestamp: "2026-06-01T09:14:00.000Z",
      actor: "alice",
      tool: "log_interaction",
      slug: "acme-corp",
      summary: "Called about Q3 renewal",
    });

    const { fs: memFs } = await import("memfs");
    expect(memFs.existsSync("/data/.agentic/audit.log")).toBe(true);
  });

  it("writes a pipe-separated line", async () => {
    vol.fromJSON({ "/data/.agentic/": null });
    const { writeAuditEntry } = await import("../../src/fs/audit-log.js");

    writeAuditEntry("/data", {
      timestamp: "2026-06-01T09:14:00.000Z",
      actor: "alice",
      tool: "log_interaction",
      slug: "acme-corp",
      summary: "Called about Q3 renewal",
    });

    const { fs: memFs } = await import("memfs");
    const content = memFs.readFileSync("/data/.agentic/audit.log", "utf-8") as string;
    expect(content).toContain("2026-06-01T09:14:00.000Z");
    expect(content).toContain("alice");
    expect(content).toContain("log_interaction");
    expect(content).toContain("acme-corp");
    expect(content).toContain("Called about Q3 renewal");
    // Pipe-separated format
    expect(content).toContain("|");
  });

  it("appends to existing audit.log", async () => {
    vol.fromJSON({
      "/data/.agentic/audit.log":
        "2026-06-01T08:00:00.000Z | bob | update_deal | beta-inc | New deal\n",
    });
    const { writeAuditEntry } = await import("../../src/fs/audit-log.js");

    writeAuditEntry("/data", {
      timestamp: "2026-06-01T09:14:00.000Z",
      actor: "alice",
      tool: "log_interaction",
      slug: "acme-corp",
      summary: "Called about Q3 renewal",
    });

    const { fs: memFs } = await import("memfs");
    const content = memFs.readFileSync("/data/.agentic/audit.log", "utf-8") as string;
    expect(content).toContain("bob");
    expect(content).toContain("alice");
  });

  it("truncates summary to 120 chars", async () => {
    vol.fromJSON({ "/data/.agentic/": null });
    const { writeAuditEntry } = await import("../../src/fs/audit-log.js");

    const longSummary = "A".repeat(200);
    writeAuditEntry("/data", {
      timestamp: "2026-06-01T09:14:00.000Z",
      actor: "alice",
      tool: "log_interaction",
      slug: "acme-corp",
      summary: longSummary,
    });

    const { fs: memFs } = await import("memfs");
    const content = memFs.readFileSync("/data/.agentic/audit.log", "utf-8") as string;
    // The line should not contain more than 120 A's in the summary field
    expect(content).not.toContain("A".repeat(121));
    expect(content).toContain("A".repeat(120));
  });

  it("creates .agentic directory when it does not exist", async () => {
    vol.fromJSON({});
    const { writeAuditEntry } = await import("../../src/fs/audit-log.js");

    writeAuditEntry("/data", {
      timestamp: "2026-06-01T09:14:00.000Z",
      actor: "alice",
      tool: "log_interaction",
      slug: "acme-corp",
      summary: "Test",
    });

    const { fs: memFs } = await import("memfs");
    expect(memFs.existsSync("/data/.agentic/audit.log")).toBe(true);
  });

  it("each entry ends with a newline", async () => {
    vol.fromJSON({ "/data/.agentic/": null });
    const { writeAuditEntry } = await import("../../src/fs/audit-log.js");

    writeAuditEntry("/data", {
      timestamp: "2026-06-01T09:14:00.000Z",
      actor: "alice",
      tool: "log_interaction",
      slug: "acme-corp",
      summary: "Test entry",
    });

    const { fs: memFs } = await import("memfs");
    const content = memFs.readFileSync("/data/.agentic/audit.log", "utf-8") as string;
    expect(content.endsWith("\n")).toBe(true);
  });
});

describe("readAuditLog", () => {
  it("returns empty array when audit.log does not exist", async () => {
    vol.fromJSON({});
    const { readAuditLog } = await import("../../src/fs/audit-log.js");
    const entries = readAuditLog("/data");
    expect(entries).toEqual([]);
  });

  it("parses a single entry correctly", async () => {
    vol.fromJSON({
      "/data/.agentic/audit.log":
        "2026-06-01T09:14:00.000Z | alice | log_interaction | acme-corp | Called about Q3 renewal\n",
    });
    const { readAuditLog } = await import("../../src/fs/audit-log.js");
    const entries = readAuditLog("/data");

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      timestamp: "2026-06-01T09:14:00.000Z",
      actor: "alice",
      tool: "log_interaction",
      slug: "acme-corp",
      summary: "Called about Q3 renewal",
    });
  });

  it("parses multiple entries", async () => {
    vol.fromJSON({
      "/data/.agentic/audit.log":
        "2026-06-01T08:00:00.000Z | bob | update_deal | beta-inc | New deal\n" +
        "2026-06-01T09:14:00.000Z | alice | log_interaction | acme-corp | Called about Q3\n",
    });
    const { readAuditLog } = await import("../../src/fs/audit-log.js");
    const entries = readAuditLog("/data");
    expect(entries).toHaveLength(2);
    expect(entries[0]?.actor).toBe("bob");
    expect(entries[1]?.actor).toBe("alice");
  });

  it("skips blank lines", async () => {
    vol.fromJSON({
      "/data/.agentic/audit.log":
        "2026-06-01T09:14:00.000Z | alice | log_interaction | acme-corp | Summary\n\n",
    });
    const { readAuditLog } = await import("../../src/fs/audit-log.js");
    const entries = readAuditLog("/data");
    expect(entries).toHaveLength(1);
  });

  it("handles entries written via writeAuditEntry round-trip", async () => {
    vol.fromJSON({ "/data/.agentic/": null });
    const { writeAuditEntry, readAuditLog } = await import("../../src/fs/audit-log.js");

    writeAuditEntry("/data", {
      timestamp: "2026-06-01T09:14:00.000Z",
      actor: "alice",
      tool: "log_interaction",
      slug: "acme-corp",
      summary: "Called about Q3 renewal",
    });

    const entries = readAuditLog("/data");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actor).toBe("alice");
    expect(entries[0]?.slug).toBe("acme-corp");
  });
});

describe("filterAuditLog", () => {
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
    {
      timestamp: "2026-06-03T10:00:00.000Z",
      actor: "alice",
      tool: "update_deal",
      slug: "acme-corp",
      summary: "Another deal",
    },
  ];

  it("returns all entries when no filters applied", async () => {
    const { filterAuditLog } = await import("../../src/fs/audit-log.js");
    const result = filterAuditLog(sampleEntries, {});
    expect(result).toHaveLength(3);
  });

  it("filters by slug", async () => {
    const { filterAuditLog } = await import("../../src/fs/audit-log.js");
    const result = filterAuditLog(sampleEntries, { slug: "acme-corp" });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.slug === "acme-corp")).toBe(true);
  });

  it("filters by actor", async () => {
    const { filterAuditLog } = await import("../../src/fs/audit-log.js");
    const result = filterAuditLog(sampleEntries, { actor: "alice" });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.actor === "alice")).toBe(true);
  });

  it("applies limit", async () => {
    const { filterAuditLog } = await import("../../src/fs/audit-log.js");
    const result = filterAuditLog(sampleEntries, { limit: 2 });
    expect(result).toHaveLength(2);
  });

  it("combines slug and actor filters", async () => {
    const { filterAuditLog } = await import("../../src/fs/audit-log.js");
    const result = filterAuditLog(sampleEntries, { slug: "acme-corp", actor: "alice" });
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no entries match", async () => {
    const { filterAuditLog } = await import("../../src/fs/audit-log.js");
    const result = filterAuditLog(sampleEntries, { slug: "nonexistent" });
    expect(result).toHaveLength(0);
  });

  it("limit applies after slug/actor filtering", async () => {
    const { filterAuditLog } = await import("../../src/fs/audit-log.js");
    const result = filterAuditLog(sampleEntries, { actor: "alice", limit: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]?.actor).toBe("alice");
  });

  it("returns last N entries when only limit is set (tail behavior)", async () => {
    const { filterAuditLog } = await import("../../src/fs/audit-log.js");
    // limit should return last N from the array
    const result = filterAuditLog(sampleEntries, { limit: 1 });
    expect(result).toHaveLength(1);
    // last entry is "Another deal" by alice for acme-corp
    expect(result[0]?.summary).toBe("Another deal");
  });
});

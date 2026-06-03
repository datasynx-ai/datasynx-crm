import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
  vi.resetModules();
});

describe("handleGetAuditLog", () => {
  it("returns empty entries when audit log does not exist", async () => {
    vol.fromJSON({});
    const { handleGetAuditLog } = await import("../../../src/mcp/tools/get-audit-log.js");
    const result = await handleGetAuditLog({}, "/data");

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { total: number; returned: number; entries: unknown[] };
    expect(parsed.total).toBe(0);
    expect(parsed.entries).toHaveLength(0);
  });

  it("returns audit entries from log file", async () => {
    vol.fromJSON({
      "/data/.agentic/audit.log":
        "2026-06-01T09:00:00Z | alice | log_interaction | acme-corp | Called about renewal\n" +
        "2026-06-01T10:00:00Z | bob | update_deal | beta-inc | Updated deal stage\n",
    });

    const { handleGetAuditLog } = await import("../../../src/mcp/tools/get-audit-log.js");
    const result = await handleGetAuditLog({}, "/data");

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as {
      total: number;
      entries: Array<{ actor: string; slug: string }>;
    };
    expect(parsed.total).toBe(2);
    expect(parsed.entries.some((e) => e.actor === "alice")).toBe(true);
    expect(parsed.entries.some((e) => e.slug === "beta-inc")).toBe(true);
  });

  it("filters by slug", async () => {
    vol.fromJSON({
      "/data/.agentic/audit.log":
        "2026-06-01T09:00:00Z | alice | log_interaction | acme-corp | Called\n" +
        "2026-06-01T10:00:00Z | bob | update_deal | beta-inc | Updated\n",
    });

    const { handleGetAuditLog } = await import("../../../src/mcp/tools/get-audit-log.js");
    const result = await handleGetAuditLog({ slug: "acme-corp" }, "/data");

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { returned: number; entries: Array<{ slug: string }> };
    expect(parsed.returned).toBe(1);
    expect(parsed.entries[0]?.slug).toBe("acme-corp");
  });

  it("filters by actor", async () => {
    vol.fromJSON({
      "/data/.agentic/audit.log":
        "2026-06-01T09:00:00Z | alice | log_interaction | acme-corp | Called\n" +
        "2026-06-01T10:00:00Z | bob | update_deal | beta-inc | Updated\n",
    });

    const { handleGetAuditLog } = await import("../../../src/mcp/tools/get-audit-log.js");
    const result = await handleGetAuditLog({ actor: "bob" }, "/data");

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { returned: number; entries: Array<{ actor: string }> };
    expect(parsed.returned).toBe(1);
    expect(parsed.entries[0]?.actor).toBe("bob");
  });

  it("respects limit", async () => {
    const lines = Array.from(
      { length: 10 },
      (_, i) =>
        `2026-06-0${Math.floor(i / 3) + 1}T0${i % 3}:00:00Z | alice | log_interaction | acme-corp | Entry ${i}\n`
    ).join("");
    vol.fromJSON({ "/data/.agentic/audit.log": lines });

    const { handleGetAuditLog } = await import("../../../src/mcp/tools/get-audit-log.js");
    const result = await handleGetAuditLog({ limit: 3 }, "/data");

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { returned: number };
    expect(parsed.returned).toBe(3);
  });

  it("registered handler invokes handleGetAuditLog with optional params", async () => {
    vol.fromJSON({});
    const { registerGetAuditLog } = await import("../../../src/mcp/tools/get-audit-log.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerGetAuditLog(fakeServer as never, "/data");
    const result = await capturedHandler!({ slug: "acme", actor: "user", limit: 5 });
    const parsed = JSON.parse(result.content[0]!.text) as { total: number };
    expect(typeof parsed.total).toBe("number");
  });
});

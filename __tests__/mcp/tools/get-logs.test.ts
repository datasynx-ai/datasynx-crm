import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";

const DATA_DIR = "/data";

function line(level: string, component: string, message: string, ts: string): string {
  return JSON.stringify({ ts, level, component, message }) + "\n";
}

beforeEach(() => {
  vol.reset();
  vol.mkdirSync(`${DATA_DIR}/.agentic`, { recursive: true });
  vol.writeFileSync(
    `${DATA_DIR}/.agentic/logs.ndjson`,
    line("info", "gmail-sync", "synced 3 mails", "2026-06-10T08:00:00.000Z") +
      line("error", "gmail-sync", "imap down", "2026-06-10T09:00:00.000Z") +
      line("warn", "booking", "free/busy lookup failed", "2026-06-10T10:00:00.000Z")
  );
});

function parse(res: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
}

describe("get_logs (#69)", () => {
  it("returns filtered raw entries", async () => {
    const { handleGetLogs } = await import("../../../src/mcp/tools/get-logs.js");
    const res = parse(await handleGetLogs({ component: "gmail-sync", level: "error" }, DATA_DIR));
    expect(res["returned"]).toBe(1);
    expect((res["entries"] as Array<{ message: string }>)[0]!.message).toBe("imap down");
  });

  it("filters by substring and since-timestamp", async () => {
    const { handleGetLogs } = await import("../../../src/mcp/tools/get-logs.js");
    const res = parse(
      await handleGetLogs({ contains: "LOOKUP", since: "2026-06-10T09:30:00.000Z" }, DATA_DIR)
    );
    expect(res["returned"]).toBe(1);
    expect((res["entries"] as Array<{ component: string }>)[0]!.component).toBe("booking");
  });

  it("aggregates counts in summary mode", async () => {
    const { handleGetLogs } = await import("../../../src/mcp/tools/get-logs.js");
    const res = parse(await handleGetLogs({ summary: true }, DATA_DIR));
    expect(res["total"]).toBe(3);
    expect(res["byLevel"]).toMatchObject({ info: 1, error: 1, warn: 1 });
    expect((res["recentErrors"] as unknown[]).length).toBeGreaterThanOrEqual(1);
  });
});

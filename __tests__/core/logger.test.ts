import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/crm";
const ENV = { ...process.env };

beforeEach(() => {
  vol.reset();
  process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  process.env["DXCRM_LOG_STDERR"] = "off"; // keep tests quiet
  delete process.env["DXCRM_LOG_LEVEL"];
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("logger", () => {
  it("persists structured entries as NDJSON and reads them back", async () => {
    const { logger, queryLogs } = await import("../../src/core/logger.js");
    logger.info("gmail-sync", "synced messages", { count: 3 });
    logger.error("lancedb", "index failed", { slug: "acme" });

    const entries = queryLogs(DATA_DIR, {});
    expect(entries).toHaveLength(2);
    expect(entries[0]!.component).toBe("gmail-sync");
    expect(entries[0]!.level).toBe("info");
    expect(entries[0]!.context).toEqual({ count: 3 });
    expect(entries[1]!.level).toBe("error");
    // each entry carries an ISO timestamp
    expect(entries[0]!.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("respects the configured minimum level", async () => {
    process.env["DXCRM_LOG_LEVEL"] = "warn";
    const { logger, queryLogs } = await import("../../src/core/logger.js");
    logger.debug("x", "debug msg");
    logger.info("x", "info msg");
    logger.warn("x", "warn msg");
    logger.error("x", "error msg");
    const levels = queryLogs(DATA_DIR, {}).map((e) => e.level);
    expect(levels).toEqual(["warn", "error"]);
  });

  it("filters by level, component, and substring", async () => {
    const { logger, queryLogs } = await import("../../src/core/logger.js");
    logger.info("gmail-sync", "alpha");
    logger.warn("gmail-sync", "beta");
    logger.error("graph", "gamma alpha");

    expect(queryLogs(DATA_DIR, { component: "gmail-sync" })).toHaveLength(2);
    expect(queryLogs(DATA_DIR, { level: "error" })).toHaveLength(1);
    expect(queryLogs(DATA_DIR, { contains: "alpha" }).map((e) => e.message)).toEqual([
      "alpha",
      "gamma alpha",
    ]);
  });

  it("returns only the last `limit` entries (most recent)", async () => {
    const { logger, queryLogs } = await import("../../src/core/logger.js");
    for (let i = 0; i < 5; i++) logger.info("x", `msg-${i}`);
    const last2 = queryLogs(DATA_DIR, { limit: 2 });
    expect(last2.map((e) => e.message)).toEqual(["msg-3", "msg-4"]);
  });

  it("summarizes counts by level and component with recent errors", async () => {
    const { logger, summarizeLogs } = await import("../../src/core/logger.js");
    logger.info("a", "1");
    logger.warn("a", "2");
    logger.error("b", "boom", { code: 1 });

    const s = summarizeLogs(DATA_DIR);
    expect(s.total).toBe(3);
    expect(s.byLevel.info).toBe(1);
    expect(s.byLevel.warn).toBe(1);
    expect(s.byLevel.error).toBe(1);
    expect(s.byComponent.a).toBe(2);
    expect(s.byComponent.b).toBe(1);
    expect(s.recentErrors).toHaveLength(1);
    expect(s.recentErrors[0]!.message).toBe("boom");
  });

  it("skips a malformed log line instead of failing the whole read", async () => {
    const { logger, queryLogs } = await import("../../src/core/logger.js");
    logger.info("a", "good1");
    vol.appendFileSync("/crm/.agentic/logs.ndjson", "{ truncated\n");
    logger.info("a", "good2");
    expect(queryLogs(DATA_DIR, {}).map((e) => e.message)).toEqual(["good1", "good2"]);
  });

  it("never throws from a logging call", async () => {
    const { logger } = await import("../../src/core/logger.js");
    // No data dir resolvable to a writable path should still not throw.
    expect(() => logger.info("x", "safe")).not.toThrow();
  });
});

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
  process.env["DXCRM_LOG_STDERR"] = "off";
  delete process.env["DXCRM_LOG_LEVEL"];
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("logger rotation", () => {
  it("rotates the ledger when it exceeds the byte budget and keeps archives", async () => {
    process.env["DXCRM_LOG_MAX_BYTES"] = "300";
    process.env["DXCRM_LOG_MAX_FILES"] = "3";
    const { logger } = await import("../../src/core/logger.js");

    for (let i = 0; i < 40; i++) logger.info("comp", `message number ${i} with some padding`);

    // The active ledger plus at least one rotated archive should exist.
    expect(vol.existsSync("/crm/.agentic/logs.ndjson")).toBe(true);
    expect(vol.existsSync("/crm/.agentic/logs.ndjson.1")).toBe(true);
    // Never more archives than DXCRM_LOG_MAX_FILES.
    expect(vol.existsSync("/crm/.agentic/logs.ndjson.4")).toBe(false);
  });

  it("queryLogs reads across rotated archives so history is not lost", async () => {
    // Budget large enough that all 30 entries fit across current + archives,
    // but small enough that rotation still happens several times.
    process.env["DXCRM_LOG_MAX_BYTES"] = "1000";
    process.env["DXCRM_LOG_MAX_FILES"] = "10";
    const { logger, queryLogs } = await import("../../src/core/logger.js");

    for (let i = 0; i < 30; i++) logger.info("comp", `entry-${i}`);
    // Sanity: rotation actually occurred.
    expect(vol.existsSync("/crm/.agentic/logs.ndjson.1")).toBe(true);

    const all = queryLogs(DATA_DIR, {});
    // Every entry is still retrievable despite rotation, in chronological order.
    expect(all.length).toBe(30);
    expect(all[0]!.message).toBe("entry-0");
    expect(all[all.length - 1]!.message).toBe("entry-29");
  });

  it("respects DXCRM_LOG_MAX_FILES=0 (truncate, no archives)", async () => {
    process.env["DXCRM_LOG_MAX_BYTES"] = "200";
    process.env["DXCRM_LOG_MAX_FILES"] = "0";
    const { logger } = await import("../../src/core/logger.js");

    for (let i = 0; i < 20; i++) logger.info("comp", `entry-${i} padded out a bit`);
    expect(vol.existsSync("/crm/.agentic/logs.ndjson.1")).toBe(false);
  });
});

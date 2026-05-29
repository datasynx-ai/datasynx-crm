import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";
import { calcSlaDue, isSlaBreach } from "../../src/core/sla-engine.js";

vi.mock("fs", async () => { const { fs } = await import("memfs"); return { default: fs, ...fs }; });
vi.mock("@lancedb/lancedb", () => ({ connect: vi.fn().mockResolvedValue({ tableNames: vi.fn().mockResolvedValue([]) }) }));

const DEFAULT_RULES = [
  { priority: "urgent" as const, resolveDays: 1 },
  { priority: "high" as const, resolveDays: 2 },
  { priority: "normal" as const, resolveDays: 5 },
  { priority: "low" as const, resolveDays: 10 },
];

describe("calcSlaDue", () => {
  it("calculates 1 day for urgent", () => {
    expect(calcSlaDue("2026-05-29", "urgent", DEFAULT_RULES)).toBe("2026-05-30");
  });

  it("calculates 2 days for high", () => {
    expect(calcSlaDue("2026-05-29", "high", DEFAULT_RULES)).toBe("2026-05-31");
  });

  it("calculates 5 days for normal", () => {
    expect(calcSlaDue("2026-05-29", "normal", DEFAULT_RULES)).toBe("2026-06-03");
  });

  it("calculates 10 days for low", () => {
    expect(calcSlaDue("2026-05-29", "low", DEFAULT_RULES)).toBe("2026-06-08");
  });

  it("handles month boundary correctly", () => {
    expect(calcSlaDue("2026-01-30", "high", DEFAULT_RULES)).toBe("2026-02-01");
  });
});

describe("isSlaBreach", () => {
  it("returns true when slaDue is past and ticket is open", () => {
    const ticket = { id: "T-001", title: "Bug", status: "open" as const, priority: "high" as const, created: "2026-05-20", slaDue: "2026-05-22" };
    expect(isSlaBreach(ticket, "2026-05-29")).toBe(true);
  });

  it("returns false when ticket is resolved", () => {
    const ticket = { id: "T-001", title: "Bug", status: "resolved" as const, priority: "high" as const, created: "2026-05-20", slaDue: "2026-05-22", resolved: "2026-05-23" };
    expect(isSlaBreach(ticket, "2026-05-29")).toBe(false);
  });

  it("returns false when slaDue is in the future", () => {
    const ticket = { id: "T-001", title: "Bug", status: "open" as const, priority: "normal" as const, created: "2026-05-29", slaDue: "2026-06-03" };
    expect(isSlaBreach(ticket, "2026-05-29")).toBe(false);
  });

  it("returns false when no slaDue set", () => {
    const ticket = { id: "T-001", title: "Bug", status: "open" as const, priority: "normal" as const, created: "2026-05-29" };
    expect(isSlaBreach(ticket, "2026-05-29")).toBe(false);
  });

  it("returns false when ticket is closed", () => {
    const ticket = { id: "T-001", title: "Bug", status: "closed" as const, priority: "urgent" as const, created: "2026-05-20", slaDue: "2026-05-21" };
    expect(isSlaBreach(ticket, "2026-05-29")).toBe(false);
  });
});

describe("checkSlaBreaches", () => {
  beforeEach(() => { vol.reset(); vi.resetModules(); });

  it("returns empty array when no customers", async () => {
    vol.fromJSON({});
    const { checkSlaBreaches } = await import("../../src/core/sla-engine.js");
    const breaches = await checkSlaBreaches("/data", "2026-05-29");
    expect(breaches).toEqual([]);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
});

const DATA_DIR = "/crm";

const AUDIT = [
  "2026-06-01T09:00:00Z | alice | log_interaction | acme | Called about renewal",
  "2026-06-01T10:00:00Z | system | update_deal | acme | Enterprise License",
  "2026-06-01T11:00:00Z | system | log_interaction | beta | Email received",
  "",
].join("\n");

describe("computeAuditMetrics", () => {
  it("aggregates operations by tool, actor, customers and automation rate", async () => {
    vol.fromJSON({ "/crm/.agentic/audit.log": AUDIT });
    const { computeAuditMetrics } = await import("../../src/core/metrics.js");
    const m = computeAuditMetrics(DATA_DIR);

    expect(m.totalOperations).toBe(3);
    expect(m.byTool["log_interaction"]).toBe(2);
    expect(m.byTool["update_deal"]).toBe(1);
    expect(m.byActor["system"]).toBe(2);
    expect(m.customersTouched).toBe(2); // acme, beta
    expect(m.automationRate).toBeCloseTo(2 / 3);
  });

  it("returns zeros for an empty/absent log", async () => {
    vol.fromJSON({});
    const { computeAuditMetrics } = await import("../../src/core/metrics.js");
    const m = computeAuditMetrics(DATA_DIR);
    expect(m.totalOperations).toBe(0);
    expect(m.automationRate).toBe(0);
  });
});

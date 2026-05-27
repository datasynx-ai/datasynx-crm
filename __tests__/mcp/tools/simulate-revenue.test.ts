import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";

function makePipelineMd(): string {
  return `# Pipeline

| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |
|------|-------|-------|----------|-------------|------------|-------|---------|
| Q3 Renewal | negotiation | 50000 |  | 75 | 2026-06-15 | Budget confirmed | 2026-05-20 |`;
}

function makeHealthJson(): string {
  return JSON.stringify({
    schemaVersion: "1",
    slug: SLUG,
    overallHealth: 75,
    updatedAt: new Date().toISOString(),
    contacts: [],
    atRiskContacts: [],
    coldContacts: [],
  });
}

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe("handleSimulateRevenue", () => {
  it("returns forecast object with p10/p50/p90 keys", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { handleSimulateRevenue } = await import("../../../src/mcp/tools/simulate-revenue.js");
    const result = await handleSimulateRevenue({ iterations: 100 }, DATA_DIR);
    const parsed = parseResult(result);
    const forecast = parsed["forecast"] as Record<string, unknown>;
    expect(typeof forecast["p10"]).toBe("number");
    expect(typeof forecast["p50"]).toBe("number");
    expect(typeof forecast["p90"]).toBe("number");
  });

  it("defaults to horizon=quarter", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { handleSimulateRevenue } = await import("../../../src/mcp/tools/simulate-revenue.js");
    const result = await handleSimulateRevenue({ iterations: 100 }, DATA_DIR);
    const parsed = parseResult(result);
    expect(parsed["horizon"]).toBe("quarter");
  });

  it("returns dealCount in response", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { handleSimulateRevenue } = await import("../../../src/mcp/tools/simulate-revenue.js");
    const result = await handleSimulateRevenue({ iterations: 100 }, DATA_DIR);
    const parsed = parseResult(result);
    expect(typeof parsed["dealCount"]).toBe("number");
  });

  it("returns simulatedAt timestamp", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { handleSimulateRevenue } = await import("../../../src/mcp/tools/simulate-revenue.js");
    const result = await handleSimulateRevenue({ iterations: 100 }, DATA_DIR);
    const parsed = parseResult(result);
    expect(typeof parsed["simulatedAt"]).toBe("string");
  });

  it("returns empty forecast (all zeros) when no customers dir", async () => {
    vol.fromJSON({});
    const { handleSimulateRevenue } = await import("../../../src/mcp/tools/simulate-revenue.js");
    const result = await handleSimulateRevenue({ iterations: 100 }, DATA_DIR);
    const parsed = parseResult(result);
    const forecast = parsed["forecast"] as Record<string, unknown>;
    expect(forecast["p50"]).toBe(0);
    expect(parsed["dealCount"]).toBe(0);
  });

  it("accepts horizon=year", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { handleSimulateRevenue } = await import("../../../src/mcp/tools/simulate-revenue.js");
    const result = await handleSimulateRevenue({ horizon: "year", iterations: 100 }, DATA_DIR);
    const parsed = parseResult(result);
    expect(parsed["horizon"]).toBe("year");
  });
});

describe("registerSimulateRevenue — MCP registration", () => {
  it("registers tool with name simulate_revenue", async () => {
    const { registerSimulateRevenue } = await import("../../../src/mcp/tools/simulate-revenue.js");
    const registeredTools: string[] = [];
    const fakeServer = {
      registerTool: (name: string) => { registeredTools.push(name); },
    };
    registerSimulateRevenue(fakeServer as never);
    expect(registeredTools).toContain("simulate_revenue");
  });
});

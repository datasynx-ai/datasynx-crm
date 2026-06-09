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

  it("defaults to the rolling 90d horizon (#55)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { handleSimulateRevenue } = await import("../../../src/mcp/tools/simulate-revenue.js");
    const result = await handleSimulateRevenue({ iterations: 100 }, DATA_DIR);
    const parsed = parseResult(result);
    expect(parsed["horizon"]).toBe("90d");
  });

  it("reports excludedDeals + excludedValue instead of dropping them silently (#55)", async () => {
    // A deal far in the future is beyond any rolling/quarter horizon.
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: `# Pipeline

| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |
|------|-------|-------|----------|-------------|------------|-------|---------|
| Far Future | negotiation | 90000 |  | 75 | 2099-01-01 | | 2026-05-20 |`,
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { handleSimulateRevenue } = await import("../../../src/mcp/tools/simulate-revenue.js");
    const result = await handleSimulateRevenue({ iterations: 100 }, DATA_DIR);
    const parsed = parseResult(result);
    expect(parsed["includedDeals"]).toBe(0);
    const excluded = parsed["excludedDeals"] as Array<{ name: string }>;
    expect(excluded.map((d) => d.name)).toContain("Far Future");
    expect(parsed["excludedValue"]).toBe(90000);
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

  it("breaks the simulation down by owner and supports an owner filter (#51)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: `# Pipeline

| Deal | Stage | Value | Currency | Probability | Close Date | Updated | Notes | Owner |
|---|---|---|---|---|---|---|---|---|
| A | negotiation | 50000 |  | 60 | 2026-06-20 | 2026-06-01 |  | alice |
| B | proposal | 40000 |  | 50 | 2026-06-25 | 2026-06-01 |  | bob |`,
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { handleSimulateRevenue } = await import("../../../src/mcp/tools/simulate-revenue.js");

    const all = parseResult(
      await handleSimulateRevenue({ iterations: 100, horizon: "year" }, DATA_DIR)
    );
    const byOwner = all["byOwner"] as Record<string, { count: number }>;
    expect(Object.keys(byOwner).sort()).toEqual(["alice", "bob"]);

    const filtered = parseResult(
      await handleSimulateRevenue({ iterations: 100, owner: "alice", horizon: "year" }, DATA_DIR)
    );
    expect(filtered["includedDeals"]).toBe(1);
    expect(Object.keys(filtered["byOwner"] as object)).toEqual(["alice"]);
  });

  it("returns error response when buildSimulationInput throws", async () => {
    vi.doMock("../../../src/core/revenue-simulation.js", () => ({
      buildSimulationInput: vi.fn().mockRejectedValue(new Error("simulation error")),
      runSimulation: vi.fn(),
      buildConfidenceMessage: vi.fn(),
    }));
    vol.fromJSON({});
    const { handleSimulateRevenue } = await import("../../../src/mcp/tools/simulate-revenue.js");
    const result = await handleSimulateRevenue({ iterations: 100 }, DATA_DIR);
    const parsed = parseResult(result);
    expect(parsed["success"]).toBe(false);
    expect(parsed["error"]).toContain("simulation error");
  });
});

describe("registerSimulateRevenue — MCP registration", () => {
  it("registers tool with name simulate_revenue", async () => {
    const { registerSimulateRevenue } = await import("../../../src/mcp/tools/simulate-revenue.js");
    const registeredTools: string[] = [];
    const fakeServer = {
      registerTool: (name: string) => {
        registeredTools.push(name);
      },
    };
    registerSimulateRevenue(fakeServer as never);
    expect(registeredTools).toContain("simulate_revenue");
  });
});

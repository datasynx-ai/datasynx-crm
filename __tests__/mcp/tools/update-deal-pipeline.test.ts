import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";

const DATA_DIR = "/data";

function parse(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

beforeEach(() => {
  vol.reset();
  delete process.env["DXCRM_ACTOR"];
  vol.mkdirSync(`${DATA_DIR}/customers/acme`, { recursive: true });
});

describe("update_deal — pipeline awareness (#47)", () => {
  it("assigns a deal to a named pipeline and validates its custom stage", async () => {
    const { createPipeline, setStageForPipeline } = await import("../../../src/core/pipelines.js");
    createPipeline(DATA_DIR, { id: "renewals", label: "Renewals" });
    setStageForPipeline(DATA_DIR, "renewals", {
      id: "renewal-review",
      label: "Renewal Review",
      order: 2,
      probability: 60,
    });

    const { handleUpdateDeal } = await import("../../../src/mcp/tools/update-deal.js");
    const res = parse(
      await handleUpdateDeal(
        {
          slug: "acme",
          dealName: "ACME Renewal",
          stage: "renewal-review",
          value: 12000,
          pipelineId: "renewals",
        },
        DATA_DIR
      )
    );
    expect(res["success"]).toBe(true);
    const deal = res["deal"] as { pipeline: string; stage: string };
    expect(deal.pipeline).toBe("renewals");
    expect(deal.stage).toBe("renewal-review");

    // Round-trip through pipeline.md
    const { readPipeline } = await import("../../../src/fs/pipeline-writer.js");
    const deals = await readPipeline(DATA_DIR, "acme");
    expect(deals[0]?.pipeline).toBe("renewals");
  });

  it("rejects a stage that does not exist in the deal's pipeline", async () => {
    const { createPipeline } = await import("../../../src/core/pipelines.js");
    createPipeline(DATA_DIR, { id: "renewals" });

    const { handleUpdateDeal } = await import("../../../src/mcp/tools/update-deal.js");
    const res = parse(
      await handleUpdateDeal(
        { slug: "acme", dealName: "X", stage: "ghost-stage", pipelineId: "renewals" },
        DATA_DIR
      )
    );
    expect(res["success"]).toBe(false);
    expect(String(res["error"])).toMatch(/not defined in pipeline 'renewals'/);
  });

  it("rejects an unknown pipeline", async () => {
    const { handleUpdateDeal } = await import("../../../src/mcp/tools/update-deal.js");
    const res = parse(
      await handleUpdateDeal(
        { slug: "acme", dealName: "X", stage: "lead", pipelineId: "ghost" },
        DATA_DIR
      )
    );
    expect(res["success"]).toBe(false);
    expect(String(res["error"])).toMatch(/Pipeline 'ghost' not found/);
  });

  it("deals without pipeline stay in the default pipeline (back-compat)", async () => {
    const { handleUpdateDeal } = await import("../../../src/mcp/tools/update-deal.js");
    const res = parse(
      await handleUpdateDeal({ slug: "acme", dealName: "Plain", stage: "proposal" }, DATA_DIR)
    );
    expect(res["success"]).toBe(true);
    expect((res["deal"] as { pipeline?: string }).pipeline).toBeUndefined();

    const { handleGetPipelineForecast } =
      await import("../../../src/mcp/tools/get-pipeline-forecast.js");
    const f = parse(await handleGetPipelineForecast({}, DATA_DIR));
    expect((f["byPipeline"] as Record<string, { count: number }>)["default"]?.count).toBe(1);
  });

  it("forecast rolls up per pipeline and supports a pipelineId filter", async () => {
    const { createPipeline } = await import("../../../src/core/pipelines.js");
    createPipeline(DATA_DIR, { id: "renewals" });
    const { handleUpdateDeal } = await import("../../../src/mcp/tools/update-deal.js");
    await handleUpdateDeal(
      { slug: "acme", dealName: "New Biz", stage: "proposal", value: 10000, probability: 50 },
      DATA_DIR
    );
    await handleUpdateDeal(
      {
        slug: "acme",
        dealName: "Renewal",
        stage: "negotiation",
        value: 8000,
        probability: 50,
        pipelineId: "renewals",
      },
      DATA_DIR
    );

    const { handleGetPipelineForecast } =
      await import("../../../src/mcp/tools/get-pipeline-forecast.js");
    const all = parse(await handleGetPipelineForecast({}, DATA_DIR));
    const byPipeline = all["byPipeline"] as Record<string, { weightedValue: number }>;
    expect(byPipeline["default"]?.weightedValue).toBe(5000);
    expect(byPipeline["renewals"]?.weightedValue).toBe(4000);
    expect(all["totalWeightedValue"]).toBe(9000);

    const scoped = parse(await handleGetPipelineForecast({ pipelineId: "renewals" }, DATA_DIR));
    expect(scoped["totalWeightedValue"]).toBe(4000);
    expect((scoped["deals"] as unknown[]).length).toBe(1);
  });
});

describe("velocity/funnel — pipeline scoping (#47)", () => {
  it("filters snapshot history by pipeline (old snapshots = default)", async () => {
    const { takeSnapshot } = await import("../../../src/core/snapshots.js");
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/pipeline.md`]: `# Pipeline

| Deal | Stage | Value | Currency | Probability | Close Date | Updated | Notes | Owner | Pipeline |
|---|---|---|---|---|---|---|---|---|---|
| New Biz | proposal | 10000 | EUR | 50 |  | 2026-06-01 |  |  |  |
| Renewal | negotiation | 8000 | EUR | 50 |  | 2026-06-01 |  |  | renewals |
`,
    });
    takeSnapshot(DATA_DIR, "2026-06-01");

    const { analyzeFunnel } = await import("../../../src/core/funnel.js");
    const allFunnel = analyzeFunnel(DATA_DIR);
    const renewalsFunnel = analyzeFunnel(DATA_DIR, { pipelineId: "renewals" });
    const defaultFunnel = analyzeFunnel(DATA_DIR, { pipelineId: "default" });

    const reachedTotal = (r: { stages: Array<{ reached: number }> }) =>
      Math.max(...r.stages.map((s) => s.reached), 0);
    expect(reachedTotal(allFunnel)).toBe(2);
    expect(reachedTotal(renewalsFunnel)).toBe(1);
    expect(reachedTotal(defaultFunnel)).toBe(1);
  });
});

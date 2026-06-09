import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env["DXCRM_ACTOR"];
});

describe("get_pipeline_forecast tool", () => {
  it("returns empty when no customers directory", async () => {
    vol.fromJSON({});
    const { handleGetPipelineForecast } =
      await import("../../../src/mcp/tools/get-pipeline-forecast.js");
    const result = await handleGetPipelineForecast({}, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      deals: unknown[];
      totalWeightedValue: number;
      byStage: Record<string, unknown>;
    };
    expect(parsed.deals).toHaveLength(0);
    expect(parsed.totalWeightedValue).toBe(0);
    expect(Object.keys(parsed.byStage)).toHaveLength(0);
  });

  it("aggregates deals from multiple customers", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vol.fromJSON({
      "/data/customers/acme-corp/pipeline.md": `# Pipeline\n\n| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n|------|-------|-------|----------|-------------|------------|-------|---------||\n| Deal A | proposal | 100000 | EUR | 50 |  |  | ${today} |\n`,
      "/data/customers/beta-gmbh/pipeline.md": `# Pipeline\n\n| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n|------|-------|-------|----------|-------------|------------|-------|---------||\n| Deal B | qualified | 80000 | EUR | 30 |  |  | ${today} |\n`,
    });
    const { handleGetPipelineForecast } =
      await import("../../../src/mcp/tools/get-pipeline-forecast.js");
    const result = await handleGetPipelineForecast({}, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      deals: Array<{ slug: string; dealName: string; weightedValue: number }>;
      totalWeightedValue: number;
      byStage: Record<string, { count: number; weightedValue: number }>;
    };
    expect(parsed.deals).toHaveLength(2);
    // 100000 * 50% = 50000, 80000 * 30% = 24000, total = 74000
    expect(parsed.totalWeightedValue).toBe(74000);
    expect(parsed.byStage["proposal"]).toBeDefined();
    expect(parsed.byStage["qualified"]).toBeDefined();
  });

  it("excludes won and lost deals", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vol.fromJSON({
      "/data/customers/acme-corp/pipeline.md": `# Pipeline\n\n| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n|------|-------|-------|----------|-------------|------------|-------|---------||\n| Won Deal | won | 50000 | EUR | 100 |  |  | ${today} |\n| Lost Deal | lost | 30000 | EUR | 0 |  |  | ${today} |\n| Open Deal | proposal | 20000 | EUR | 60 |  |  | ${today} |\n`,
    });
    const { handleGetPipelineForecast } =
      await import("../../../src/mcp/tools/get-pipeline-forecast.js");
    const result = await handleGetPipelineForecast({}, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      deals: unknown[];
    };
    expect(parsed.deals).toHaveLength(1);
  });

  it("applies slug filter", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vol.fromJSON({
      "/data/customers/acme-corp/pipeline.md": `# Pipeline\n\n| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n|------|-------|-------|----------|-------------|------------|-------|---------||\n| Deal A | proposal | 100000 | EUR | 50 |  |  | ${today} |\n`,
      "/data/customers/beta-gmbh/pipeline.md": `# Pipeline\n\n| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n|------|-------|-------|----------|-------------|------------|-------|---------||\n| Deal B | qualified | 80000 | EUR | 30 |  |  | ${today} |\n`,
    });
    const { handleGetPipelineForecast } =
      await import("../../../src/mcp/tools/get-pipeline-forecast.js");
    const result = await handleGetPipelineForecast({ filter: "acme" }, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      deals: Array<{ slug: string }>;
    };
    expect(parsed.deals).toHaveLength(1);
    expect(parsed.deals[0]!.slug).toBe("acme-corp");
  });

  // ─── Issue #51: per-owner rollup + RBAC ─────────────────────────────────────
  it("rolls up the forecast by owner (explicit deal owner)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vol.fromJSON({
      "/data/customers/acme-corp/pipeline.md": `# Pipeline\n\n| Deal | Stage | Value | Currency | Probability | Close Date | Updated | Notes | Owner |\n|---|---|---|---|---|---|---|---|---|\n| Deal A | proposal | 100000 | EUR | 50 |  | ${today} |  | alice |\n| Deal B | qualified | 80000 | EUR | 50 |  | ${today} |  | bob |\n`,
    });
    const { handleGetPipelineForecast } =
      await import("../../../src/mcp/tools/get-pipeline-forecast.js");
    const result = await handleGetPipelineForecast({}, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      byOwner: Record<string, { count: number; weightedValue: number }>;
    };
    expect(parsed.byOwner["alice"]).toEqual({ count: 1, weightedValue: 50000 });
    expect(parsed.byOwner["bob"]).toEqual({ count: 1, weightedValue: 40000 });
  });

  it("supports an owner filter", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vol.fromJSON({
      "/data/customers/acme-corp/pipeline.md": `# Pipeline\n\n| Deal | Stage | Value | Currency | Probability | Close Date | Updated | Notes | Owner |\n|---|---|---|---|---|---|---|---|---|\n| Deal A | proposal | 100000 | EUR | 50 |  | ${today} |  | alice |\n| Deal B | qualified | 80000 | EUR | 50 |  | ${today} |  | bob |\n`,
    });
    const { handleGetPipelineForecast } =
      await import("../../../src/mcp/tools/get-pipeline-forecast.js");
    const result = await handleGetPipelineForecast({ owner: "alice" }, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      deals: Array<{ owner: string }>;
      byOwner: Record<string, unknown>;
    };
    expect(parsed.deals).toHaveLength(1);
    expect(parsed.deals[0]!.owner).toBe("alice");
    expect(Object.keys(parsed.byOwner)).toEqual(["alice"]);
  });

  it("RBAC: a rep sees only owned customers; a manager sees the full rollup", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vol.fromJSON({
      "/data/.agentic/rbac.json": JSON.stringify({
        actors: { carol: "rep", mona: "manager" },
        owned_customers: { carol: ["acme-corp"] },
      }),
      "/data/customers/acme-corp/pipeline.md": `# Pipeline\n\n| Deal | Stage | Value | Currency | Probability | Close Date | Updated |\n|---|---|---|---|---|---|---|\n| Deal A | proposal | 100000 | EUR | 50 |  | ${today} |\n`,
      "/data/customers/beta-gmbh/pipeline.md": `# Pipeline\n\n| Deal | Stage | Value | Currency | Probability | Close Date | Updated |\n|---|---|---|---|---|---|---|\n| Deal B | qualified | 80000 | EUR | 50 |  | ${today} |\n`,
    });
    const { handleGetPipelineForecast } =
      await import("../../../src/mcp/tools/get-pipeline-forecast.js");

    process.env["DXCRM_ACTOR"] = "carol";
    const repResult = await handleGetPipelineForecast({}, "/data");
    const rep = JSON.parse((repResult.content[0] as { type: string; text: string }).text) as {
      deals: Array<{ slug: string; owner: string }>;
    };
    expect(rep.deals).toHaveLength(1);
    expect(rep.deals[0]!.slug).toBe("acme-corp");
    // Owner resolved from rbac owned_customers when the deal has no explicit owner.
    expect(rep.deals[0]!.owner).toBe("carol");

    process.env["DXCRM_ACTOR"] = "mona";
    const mgrResult = await handleGetPipelineForecast({}, "/data");
    const mgr = JSON.parse((mgrResult.content[0] as { type: string; text: string }).text) as {
      deals: unknown[];
    };
    expect(mgr.deals).toHaveLength(2);
    delete process.env["DXCRM_ACTOR"];
  });

  it("handles error gracefully", async () => {
    vol.fromJSON({ "/data/customers/broken/pipeline.md": "not-a-table" });
    const { handleGetPipelineForecast } =
      await import("../../../src/mcp/tools/get-pipeline-forecast.js");
    // Should not throw even with broken data
    const result = await handleGetPipelineForecast({}, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      deals: unknown[];
      totalWeightedValue: number;
    };
    // broken pipeline just returns no deals (parseDealsFromMarkdown returns [])
    expect(parsed.totalWeightedValue).toBe(0);
  });

  it("returns error response when fs.readdirSync throws", async () => {
    vi.doMock("fs", async () => {
      const { fs } = await import("memfs");
      return {
        default: {
          ...fs,
          readdirSync: vi.fn().mockImplementation(() => {
            throw new Error("readdir error");
          }),
        },
        ...fs,
        readdirSync: vi.fn().mockImplementation(() => {
          throw new Error("readdir error");
        }),
      };
    });
    vol.fromJSON({ "/data/customers/.keep": "" });
    const { handleGetPipelineForecast } =
      await import("../../../src/mcp/tools/get-pipeline-forecast.js");
    const result = await handleGetPipelineForecast({}, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      success: boolean;
      error: string;
    };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("readdir error");
  });
});

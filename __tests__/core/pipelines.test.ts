import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import {
  listPipelines,
  getPipelineDef,
  createPipeline,
  setStageForPipeline,
  validStageIds,
  stageProbabilities,
  dealPipelineId,
  DEFAULT_PIPELINE_ID,
} from "../../src/core/pipelines.js";

const DATA_DIR = "/data";

beforeEach(() => vol.reset());

describe("pipelines (#47)", () => {
  it("the default pipeline maps onto the global stage list (back-compat)", () => {
    const def = getPipelineDef(DATA_DIR, DEFAULT_PIPELINE_ID);
    expect(def?.stages.map((s) => s.id)).toContain("negotiation");
    expect(listPipelines(DATA_DIR).map((p) => p.id)).toEqual(["default"]);
  });

  it("creates a named pipeline starting from the default stages", () => {
    const def = createPipeline(DATA_DIR, { id: "renewals", label: "Renewals" });
    expect(def.stages.map((s) => s.id)).toContain("won");
    expect(listPipelines(DATA_DIR).map((p) => p.id)).toEqual(["default", "renewals"]);
  });

  it("a named pipeline gets its own stages without touching the default", () => {
    createPipeline(DATA_DIR, { id: "renewals" });
    setStageForPipeline(DATA_DIR, "renewals", {
      id: "renewal-review",
      label: "Renewal Review",
      order: 2,
      probability: 60,
    });
    expect(validStageIds(DATA_DIR, "renewals")?.has("renewal-review")).toBe(true);
    expect(validStageIds(DATA_DIR, DEFAULT_PIPELINE_ID)?.has("renewal-review")).toBe(false);
    expect(stageProbabilities(DATA_DIR, "renewals")["renewal-review"]).toBe(60);
  });

  it("rejects invalid ids and unknown pipelines", () => {
    expect(() => createPipeline(DATA_DIR, { id: "Bad Id!" })).toThrow();
    expect(() => createPipeline(DATA_DIR, { id: "default" })).toThrow();
    expect(validStageIds(DATA_DIR, "ghost")).toBeNull();
  });

  it("dealPipelineId treats missing/blank as default", () => {
    expect(dealPipelineId({})).toBe("default");
    expect(dealPipelineId({ pipeline: "  " })).toBe("default");
    expect(dealPipelineId({ pipeline: "renewals" })).toBe("renewals");
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";

describe("getPipelineStages", () => {
  it("returns DEFAULT_STAGES when no file exists", async () => {
    const { getPipelineStages, DEFAULT_STAGES } = await import("../../src/core/pipeline-stages.js");
    const stages = getPipelineStages(DATA_DIR);
    expect(stages).toEqual(DEFAULT_STAGES);
  });

  it("reads custom stages from file", async () => {
    const customStages = [
      { id: "discovery", label: "Discovery", order: 1, probability: 20 },
      { id: "closed", label: "Closed", order: 2, isFinal: true, probability: 100 },
    ];
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/pipeline-stages.json`]: JSON.stringify(customStages),
    });
    const { getPipelineStages } = await import("../../src/core/pipeline-stages.js");
    const stages = getPipelineStages(DATA_DIR);
    expect(stages).toHaveLength(2);
    expect(stages[0]!.id).toBe("discovery");
  });
});

describe("setPipelineStage", () => {
  it("creates a new stage", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/`]: null });
    const { setPipelineStage, getPipelineStages } = await import("../../src/core/pipeline-stages.js");
    const newStage = { id: "discovery", label: "Discovery", order: 1, probability: 20 };
    setPipelineStage(DATA_DIR, newStage);
    const stages = getPipelineStages(DATA_DIR);
    expect(stages.some((s) => s.id === "discovery")).toBe(true);
  });

  it("updates an existing stage by id", async () => {
    const existing = [{ id: "lead", label: "Lead", order: 1, probability: 10 }];
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/pipeline-stages.json`]: JSON.stringify(existing),
    });
    const { setPipelineStage, getPipelineStages } = await import("../../src/core/pipeline-stages.js");
    setPipelineStage(DATA_DIR, { id: "lead", label: "Lead Updated", order: 1, probability: 15 });
    const stages = getPipelineStages(DATA_DIR);
    const lead = stages.find((s) => s.id === "lead");
    expect(lead?.label).toBe("Lead Updated");
    expect(lead?.probability).toBe(15);
  });

  it("maintains sort order after adding new stage", async () => {
    const existing = [
      { id: "lead", label: "Lead", order: 1, probability: 10 },
      { id: "won", label: "Won", order: 3, isFinal: true, probability: 100 },
    ];
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/pipeline-stages.json`]: JSON.stringify(existing),
    });
    const { setPipelineStage, getPipelineStages } = await import("../../src/core/pipeline-stages.js");
    setPipelineStage(DATA_DIR, { id: "qualified", label: "Qualified", order: 2, probability: 30 });
    const stages = getPipelineStages(DATA_DIR);
    expect(stages[0]!.id).toBe("lead");
    expect(stages[1]!.id).toBe("qualified");
    expect(stages[2]!.id).toBe("won");
  });
});

describe("deletePipelineStage", () => {
  it("removes a stage by id", async () => {
    const existing = [
      { id: "lead", label: "Lead", order: 1, probability: 10 },
      { id: "won", label: "Won", order: 2, isFinal: true, probability: 100 },
    ];
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/pipeline-stages.json`]: JSON.stringify(existing),
    });
    const { deletePipelineStage, getPipelineStages } = await import("../../src/core/pipeline-stages.js");
    deletePipelineStage(DATA_DIR, "lead");
    const stages = getPipelineStages(DATA_DIR);
    expect(stages.find((s) => s.id === "lead")).toBeUndefined();
    expect(stages.find((s) => s.id === "won")).toBeDefined();
  });

  it("is a no-op for a non-existent id", async () => {
    const existing = [{ id: "lead", label: "Lead", order: 1, probability: 10 }];
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/pipeline-stages.json`]: JSON.stringify(existing),
    });
    const { deletePipelineStage, getPipelineStages } = await import("../../src/core/pipeline-stages.js");
    deletePipelineStage(DATA_DIR, "nonexistent");
    const stages = getPipelineStages(DATA_DIR);
    expect(stages).toHaveLength(1);
  });
});

describe("resetToDefaults", () => {
  it("writes DEFAULT_STAGES to file", async () => {
    const custom = [{ id: "my-stage", label: "My Stage", order: 1 }];
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/pipeline-stages.json`]: JSON.stringify(custom),
    });
    const { resetToDefaults, getPipelineStages, DEFAULT_STAGES } = await import("../../src/core/pipeline-stages.js");
    resetToDefaults(DATA_DIR);
    const stages = getPipelineStages(DATA_DIR);
    expect(stages).toEqual(DEFAULT_STAGES);
  });
});

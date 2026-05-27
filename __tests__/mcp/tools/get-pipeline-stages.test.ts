import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";

describe("handleGetPipelineStages", () => {
  it("returns DEFAULT_STAGES when no custom config", async () => {
    const { handleGetPipelineStages } = await import("../../../src/mcp/tools/get-pipeline-stages.js");
    const { DEFAULT_STAGES } = await import("../../../src/core/pipeline-stages.js");
    const result = await handleGetPipelineStages({}, DATA_DIR);
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      stages: unknown[];
    };
    expect(parsed.stages).toEqual(DEFAULT_STAGES);
  });

  it("returns custom stages when configured", async () => {
    const customStages = [
      { id: "discovery", label: "Discovery", order: 1, probability: 20 },
    ];
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/pipeline-stages.json`]: JSON.stringify(customStages),
    });
    const { handleGetPipelineStages } = await import("../../../src/mcp/tools/get-pipeline-stages.js");
    const result = await handleGetPipelineStages({}, DATA_DIR);
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      stages: Array<{ id: string }>;
    };
    expect(parsed.stages).toHaveLength(1);
    expect(parsed.stages[0]!.id).toBe("discovery");
  });
});

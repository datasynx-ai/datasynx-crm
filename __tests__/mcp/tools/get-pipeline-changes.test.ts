import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => vol.reset());

const DATA_DIR = "/crm";

function pipeline(rows: Array<[string, string, number, number]>): string {
  return (
    "# Pipeline\n\n| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n|---|---|---|---|---|---|---|---|\n" +
    rows.map(([n, s, v, p]) => `| ${n} | ${s} | ${v} | EUR | ${p} | | | 2026-06-01 |`).join("\n") +
    "\n"
  );
}

describe("handleGetPipelineChanges", () => {
  it("returns an empty, non-error result when no baseline snapshot exists", async () => {
    vol.fromJSON({ "/crm/customers/acme/pipeline.md": pipeline([["D", "lead", 1, 10]]) });
    const { handleGetPipelineChanges } =
      await import("../../../src/mcp/tools/get-pipeline-changes.js");
    const res = await handleGetPipelineChanges({ since: "2026-06-01" }, DATA_DIR);
    const payload = JSON.parse(res.content[0]!.text) as {
      error?: string;
      note?: string;
      fromId: string | null;
      added: unknown[];
      won: unknown[];
      valueChanged: unknown[];
      openValueDelta: number;
    };
    // Consistent with get_pipeline_velocity / get_pipeline_funnel: a missing
    // baseline is an empty result with a hint, not a failure (agents read
    // `error` as a defect).
    expect(payload.error).toBeUndefined();
    expect(payload.note).toMatch(/snapshot/i);
    expect(payload.fromId).toBeNull();
    expect(payload.added).toEqual([]);
    expect(payload.won).toEqual([]);
    expect(payload.valueChanged).toEqual([]);
    expect(payload.openValueDelta).toBe(0);
  });

  it("returns the diff against the latest baseline snapshot", async () => {
    const { takeSnapshot } = await import("../../../src/core/snapshots.js");
    vol.fromJSON({ "/crm/customers/acme/pipeline.md": pipeline([["Big", "proposal", 50000, 50]]) });
    takeSnapshot(DATA_DIR, "2026-06-01");
    vol.fromJSON({ "/crm/customers/acme/pipeline.md": pipeline([["Big", "won", 60000, 100]]) });

    const { handleGetPipelineChanges } =
      await import("../../../src/mcp/tools/get-pipeline-changes.js");
    const res = await handleGetPipelineChanges({ since: "2026-06-02" }, DATA_DIR);
    const payload = JSON.parse(res.content[0]!.text) as {
      won: Array<{ name: string }>;
      valueChanged: Array<{ name: string; from: number; to: number }>;
    };
    expect(payload.won.map((d) => d.name)).toEqual(["Big"]);
    expect(payload.valueChanged[0]).toMatchObject({ name: "Big", from: 50000, to: 60000 });
  });
});

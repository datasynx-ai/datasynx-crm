import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => vol.reset());

const DATA_DIR = "/crm";

function writeSnap(
  id: string,
  deals: Array<{ slug: string; name: string; stage: string; value: number }>
): void {
  vol.mkdirSync("/crm/.agentic/snapshots", { recursive: true });
  vol.writeFileSync(
    `/crm/.agentic/snapshots/${id}.json`,
    JSON.stringify({
      id,
      takenAt: `${id}T00:00:00Z`,
      deals: deals.map((d) => ({ ...d, probability: 50 })),
    })
  );
}

describe("handleGetPipelineVelocity", () => {
  it("reports no data when there are no snapshots", async () => {
    const { handleGetPipelineVelocity } =
      await import("../../../src/mcp/tools/get-pipeline-velocity.js");
    const res = await handleGetPipelineVelocity({}, DATA_DIR);
    const payload = JSON.parse(res.content[0]!.text) as { snapshotCount: number };
    expect(payload.snapshotCount).toBe(0);
  });

  it("returns stage durations and stalled deals from snapshot history", async () => {
    writeSnap("2026-06-01", [{ slug: "acme", name: "Stuck", stage: "proposal", value: 40000 }]);
    writeSnap("2026-06-22", [{ slug: "acme", name: "Stuck", stage: "proposal", value: 40000 }]);

    const { handleGetPipelineVelocity } =
      await import("../../../src/mcp/tools/get-pipeline-velocity.js");
    const res = await handleGetPipelineVelocity({ stalledDays: 14 }, DATA_DIR);
    const payload = JSON.parse(res.content[0]!.text) as {
      snapshotCount: number;
      stalledThresholdDays: number;
      stalledDeals: Array<{ name: string; daysInStage: number }>;
    };
    expect(payload.snapshotCount).toBe(2);
    expect(payload.stalledThresholdDays).toBe(14);
    expect(payload.stalledDeals[0]).toMatchObject({ name: "Stuck", daysInStage: 21 });
  });
});

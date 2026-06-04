import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => vol.reset());

const DATA_DIR = "/crm";

function writeSnap(id: string, deals: Array<{ slug: string; name: string; stage: string }>): void {
  vol.mkdirSync("/crm/.agentic/snapshots", { recursive: true });
  vol.writeFileSync(
    `/crm/.agentic/snapshots/${id}.json`,
    JSON.stringify({
      id,
      takenAt: `${id}T00:00:00Z`,
      deals: deals.map((d) => ({ ...d, value: 1000, probability: 50 })),
    })
  );
}

describe("handleGetPipelineFunnel", () => {
  it("reports no data when there are no snapshots", async () => {
    const { handleGetPipelineFunnel } =
      await import("../../../src/mcp/tools/get-pipeline-funnel.js");
    const res = await handleGetPipelineFunnel({}, DATA_DIR);
    const payload = JSON.parse(res.content[0]!.text) as { snapshotCount: number };
    expect(payload.snapshotCount).toBe(0);
  });

  it("returns funnel stages and win rate from snapshot history", async () => {
    writeSnap("2026-06-01", [
      { slug: "a", name: "A", stage: "proposal" },
      { slug: "b", name: "B", stage: "proposal" },
    ]);
    writeSnap("2026-06-05", [
      { slug: "a", name: "A", stage: "won" },
      { slug: "b", name: "B", stage: "lost" },
    ]);

    const { handleGetPipelineFunnel } =
      await import("../../../src/mcp/tools/get-pipeline-funnel.js");
    const res = await handleGetPipelineFunnel({}, DATA_DIR);
    const payload = JSON.parse(res.content[0]!.text) as {
      wonCount: number;
      lostCount: number;
      winRatePct: number;
    };
    expect(payload.wonCount).toBe(1);
    expect(payload.lostCount).toBe(1);
    expect(payload.winRatePct).toBe(50);
  });
});

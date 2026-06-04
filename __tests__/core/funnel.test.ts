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

describe("pipeline funnel", () => {
  it("returns empty analytics when no snapshots exist", async () => {
    const { analyzeFunnel } = await import("../../src/core/funnel.js");
    const report = analyzeFunnel(DATA_DIR);
    expect(report.snapshotCount).toBe(0);
    expect(report.stages).toEqual([]);
    expect(report.winRatePct).toBeNull();
    expect(report.biggestLeak).toBeNull();
  });

  it("computes cumulative reach, conversion, and win rate across deal journeys", async () => {
    // A: lead → qualified → proposal → won   (reaches won)
    // B: lead → qualified → lost             (lost after qualified)
    // C: lead                                (still open at lead)
    writeSnap("2026-06-01", [
      { slug: "a", name: "A", stage: "lead" },
      { slug: "b", name: "B", stage: "lead" },
      { slug: "c", name: "C", stage: "lead" },
    ]);
    writeSnap("2026-06-02", [
      { slug: "a", name: "A", stage: "qualified" },
      { slug: "b", name: "B", stage: "qualified" },
      { slug: "c", name: "C", stage: "lead" },
    ]);
    writeSnap("2026-06-03", [
      { slug: "a", name: "A", stage: "proposal" },
      { slug: "b", name: "B", stage: "lost" },
      { slug: "c", name: "C", stage: "lead" },
    ]);
    writeSnap("2026-06-04", [
      { slug: "a", name: "A", stage: "won" },
      { slug: "b", name: "B", stage: "lost" },
      { slug: "c", name: "C", stage: "lead" },
    ]);

    const { analyzeFunnel } = await import("../../src/core/funnel.js");
    const report = analyzeFunnel(DATA_DIR);

    expect(report.snapshotCount).toBe(4);
    const reached = Object.fromEntries(report.stages.map((s) => [s.stage, s.reached]));
    expect(reached["lead"]).toBe(3);
    expect(reached["qualified"]).toBe(2);
    expect(reached["proposal"]).toBe(1);
    expect(reached["negotiation"]).toBe(1); // A reached won ⇒ counts cumulatively
    expect(reached["won"]).toBe(1);

    const conv = Object.fromEntries(report.stages.map((s) => [s.stage, s.conversionPctToNext]));
    expect(conv["lead"]).toBe(67); // 2/3
    expect(conv["qualified"]).toBe(50); // 1/2
    expect(conv["won"]).toBeNull(); // terminal, no next

    expect(report.wonCount).toBe(1);
    expect(report.lostCount).toBe(1);
    expect(report.winRatePct).toBe(50); // 1 / (1+1)

    expect(report.biggestLeak).toMatchObject({
      from: "qualified",
      to: "proposal",
      conversionPct: 50,
    });
  });
});

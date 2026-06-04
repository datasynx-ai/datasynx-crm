import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => vol.reset());

const DATA_DIR = "/crm";

interface Deal {
  slug: string;
  name: string;
  stage: string;
  value: number;
  probability: number;
}

/** Write a snapshot JSON file directly, as the daemon would over time. */
function writeSnap(id: string, deals: Deal[]): void {
  vol.mkdirSync("/crm/.agentic/snapshots", { recursive: true });
  vol.writeFileSync(
    `/crm/.agentic/snapshots/${id}.json`,
    JSON.stringify({ id, takenAt: `${id}T00:00:00Z`, deals })
  );
}

describe("pipeline velocity", () => {
  it("returns empty analytics when no snapshots exist", async () => {
    const { analyzeVelocity } = await import("../../src/core/velocity.js");
    const report = analyzeVelocity(DATA_DIR);
    expect(report.snapshotCount).toBe(0);
    expect(report.stageDurations).toEqual([]);
    expect(report.avgSalesCycleDays).toBeNull();
    expect(report.stalledDeals).toEqual([]);
  });

  it("computes per-stage dwell time and sales cycle from a deal's journey", async () => {
    // Acme/Big Deal: lead (06-01) → qualified (06-05) → proposal (06-09) → won (06-13)
    // dwell: lead 4d, qualified 4d, proposal 4d. cycle first-seen→won = 12d.
    writeSnap("2026-06-01", [d("acme", "Big Deal", "lead")]);
    writeSnap("2026-06-05", [d("acme", "Big Deal", "qualified")]);
    writeSnap("2026-06-09", [d("acme", "Big Deal", "proposal")]);
    writeSnap("2026-06-13", [d("acme", "Big Deal", "won")]);

    const { analyzeVelocity } = await import("../../src/core/velocity.js");
    const report = analyzeVelocity(DATA_DIR, { stalledDays: 30 });

    expect(report.snapshotCount).toBe(4);
    const byStage = Object.fromEntries(report.stageDurations.map((s) => [s.stage, s.avgDays]));
    expect(byStage["lead"]).toBe(4);
    expect(byStage["qualified"]).toBe(4);
    expect(byStage["proposal"]).toBe(4);
    expect(report.wonCount).toBe(1);
    expect(report.avgSalesCycleDays).toBe(12);
    expect(report.stalledDeals).toEqual([]); // won deal is closed, not stalled
  });

  it("flags open deals that have not changed stage beyond the stalled threshold", async () => {
    // Stuck deal sits in proposal from 06-01 to 06-20 (latest) = 19 days → stalled (>14).
    // Fresh deal entered negotiation on 06-18 = 2 days → not stalled.
    writeSnap("2026-06-01", [d("acme", "Stuck", "proposal", 40000)]);
    writeSnap("2026-06-18", [
      d("acme", "Stuck", "proposal", 40000),
      d("beta", "Fresh", "negotiation", 10000),
    ]);
    writeSnap("2026-06-20", [
      d("acme", "Stuck", "proposal", 40000),
      d("beta", "Fresh", "negotiation", 10000),
    ]);

    const { analyzeVelocity } = await import("../../src/core/velocity.js");
    const report = analyzeVelocity(DATA_DIR, { stalledDays: 14 });

    expect(report.stalledThresholdDays).toBe(14);
    expect(report.stalledDeals).toHaveLength(1);
    const stuck = report.stalledDeals[0]!;
    expect(stuck.name).toBe("Stuck");
    expect(stuck.stage).toBe("proposal");
    expect(stuck.daysInStage).toBe(19);
    expect(stuck.value).toBe(40000);
  });
});

function d(slug: string, name: string, stage: string, value = 1000): Deal {
  return { slug, name, stage, value, probability: 50 };
}

import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => vol.reset());

const DATA_DIR = "/crm";

function pipeline(rows: Array<[string, string, number, number]>): string {
  const header =
    "# Pipeline\n\n| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n" +
    "|---|---|---|---|---|---|---|---|\n";
  const body = rows
    .map(
      ([name, stage, value, prob]) =>
        `| ${name} | ${stage} | ${value} | EUR | ${prob} | | | 2026-06-01 |`
    )
    .join("\n");
  return header + body + "\n";
}

describe("pipeline snapshots", () => {
  it("takes a snapshot capturing all deals across customers", async () => {
    vol.fromJSON({
      "/crm/customers/acme/pipeline.md": pipeline([["Big Deal", "negotiation", 50000, 80]]),
      "/crm/customers/beta/pipeline.md": pipeline([["Beta Renewal", "proposal", 20000, 50]]),
    });
    const { takeSnapshot } = await import("../../src/core/snapshots.js");
    const snap = takeSnapshot(DATA_DIR, "2026-06-04");
    expect(snap.id).toBe("2026-06-04");
    expect(snap.deals).toHaveLength(2);
    expect(vol.existsSync("/crm/.agentic/snapshots/2026-06-04.json")).toBe(true);
  });

  it("diffs two snapshots: added, stage move (won), value change, removed", async () => {
    const { diffSnapshots } = await import("../../src/core/snapshots.js");
    const before = {
      id: "2026-06-01",
      takenAt: "2026-06-01T00:00:00Z",
      deals: [
        { slug: "acme", name: "Big Deal", stage: "proposal", value: 50000, probability: 50 },
        { slug: "beta", name: "Old Deal", stage: "lead", value: 1000, probability: 10 },
      ],
    };
    const after = {
      id: "2026-06-08",
      takenAt: "2026-06-08T00:00:00Z",
      deals: [
        { slug: "acme", name: "Big Deal", stage: "won", value: 60000, probability: 100 },
        { slug: "gamma", name: "New Deal", stage: "qualified", value: 30000, probability: 30 },
      ],
    };
    const diff = diffSnapshots(before, after);
    expect(diff.added.map((d) => d.name)).toEqual(["New Deal"]);
    expect(diff.removed.map((d) => d.name)).toEqual(["Old Deal"]);
    expect(diff.won.map((d) => d.name)).toEqual(["Big Deal"]);
    expect(diff.advanced.find((m) => m.name === "Big Deal")).toMatchObject({
      from: "proposal",
      to: "won",
    });
    expect(diff.valueChanged.find((v) => v.name === "Big Deal")).toMatchObject({
      from: 50000,
      to: 60000,
    });
  });

  it("diffAgainstNow compares live pipeline to the latest snapshot at/before `since`", async () => {
    const { takeSnapshot, diffAgainstNow } = await import("../../src/core/snapshots.js");
    vol.fromJSON({
      "/crm/customers/acme/pipeline.md": pipeline([["Big Deal", "proposal", 50000, 50]]),
    });
    takeSnapshot(DATA_DIR, "2026-06-01");
    // Pipeline advances since the snapshot
    vol.fromJSON({
      "/crm/customers/acme/pipeline.md": pipeline([["Big Deal", "negotiation", 55000, 80]]),
    });
    const diff = diffAgainstNow(DATA_DIR, "2026-06-02", "2026-06-08");
    expect(diff).not.toBeNull();
    expect(diff!.advanced.find((m) => m.name === "Big Deal")).toMatchObject({
      from: "proposal",
      to: "negotiation",
    });
    expect(diff!.valueChanged.find((v) => v.name === "Big Deal")).toMatchObject({
      from: 50000,
      to: 55000,
    });
  });

  it("lists snapshots and prunes beyond the retention limit", async () => {
    const { takeSnapshot, listSnapshots } = await import("../../src/core/snapshots.js");
    vol.fromJSON({ "/crm/customers/acme/pipeline.md": pipeline([["D", "lead", 1, 10]]) });
    for (const d of ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"]) {
      takeSnapshot(DATA_DIR, d, { keep: 2 });
    }
    const list = listSnapshots(DATA_DIR);
    expect(list.map((s) => s.id)).toEqual(["2026-06-03", "2026-06-04"]); // oldest pruned, sorted asc
  });
});

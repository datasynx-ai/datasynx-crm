import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
});

const DATA_DIR = "/crm";
async function mod() {
  return import("../../src/core/segments.js");
}

function customer(name: string, fields: Record<string, string>): string {
  const fm = [
    "---",
    `name: ${name}`,
    ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`),
    "---",
    "",
  ];
  return fm.join("\n");
}

describe("segment registry", () => {
  it("defines, lists and removes segments", async () => {
    const { defineSegment, loadSegments, removeSegment } = await mod();
    defineSegment(DATA_DIR, "hot", { stage: "active", minDealValue: 1000 });
    expect(loadSegments(DATA_DIR)).toHaveLength(1);
    expect(loadSegments(DATA_DIR)[0]!.name).toBe("hot");
    expect(removeSegment(DATA_DIR, "hot")).toBe(true);
    expect(loadSegments(DATA_DIR)).toHaveLength(0);
  });
});

describe("evaluateSegment", () => {
  beforeEach(() => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md": customer("Acme", {
        relationship_stage: "active",
        deal_value: "5000",
        tags: "[enterprise]",
        created: "2026-01-01",
        updated: "2026-06-01",
      }),
      "/crm/customers/beta/main_facts.md": customer("Beta", {
        relationship_stage: "prospect",
        deal_value: "200",
        created: "2026-01-01",
        updated: "2026-06-01",
      }),
    });
  });

  it("filters by stage", async () => {
    const { evaluateSegment } = await mod();
    expect(await evaluateSegment(DATA_DIR, { stage: "active" })).toEqual(["acme"]);
  });

  it("filters by minimum deal value", async () => {
    const { evaluateSegment } = await mod();
    expect(await evaluateSegment(DATA_DIR, { minDealValue: 1000 })).toEqual(["acme"]);
  });

  it("filters by tag", async () => {
    const { evaluateSegment } = await mod();
    expect(await evaluateSegment(DATA_DIR, { tags: ["enterprise"] })).toEqual(["acme"]);
  });

  it("filters by staleness (days since last touchpoint)", async () => {
    const { evaluateSegment } = await mod();
    // both touched 2026-06-01; far-future 'now' makes them stale
    const stale = await evaluateSegment(DATA_DIR, { staleDays: 1 }, "2030-01-01");
    expect(stale.sort()).toEqual(["acme", "beta"]);
    const none = await evaluateSegment(DATA_DIR, { staleDays: 1 }, "2026-06-01");
    expect(none).toEqual([]);
  });
});

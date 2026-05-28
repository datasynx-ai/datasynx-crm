import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";
const TODAY = "2026-05-28";

function makeGraphJson(): string {
  return JSON.stringify({
    schemaVersion: "1",
    slug: SLUG,
    nodes: [
      {
        id: "person:max@acme.com",
        type: "person",
        label: "Max Müller",
        properties: { email: "max@acme.com" },
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-05-20T00:00:00Z",
      },
    ],
    edges: [
      {
        id: "IS_CHAMPION:person:max@acme.com__deal:enterprise",
        from: "person:max@acme.com",
        to: "deal:enterprise",
        type: "IS_CHAMPION",
        weight: 0.9,
        sentiment: 0,
        lastContact: "2026-05-20",
        contactCount: 5,
        properties: {},
      },
    ],
    updatedAt: "2026-05-20T00:00:00Z",
  });
}

function makePipelineMd(): string {
  return `| Name | Stage | Value | Close Date | Probability | Updated |
|---|---|---|---|---|---|
| Enterprise License | proposal | 150000 | 2026-06-30 | 60 | 2026-05-25 |
`;
}

describe("buildDealRoom", () => {
  it("returns slug and dealName", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
    });
    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, SLUG, "Enterprise License", TODAY);
    expect(brief.slug).toBe(SLUG);
    expect(brief.dealName).toBe("Enterprise License");
  });

  it("includes generatedAt timestamp", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
    });
    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, SLUG, "Enterprise License", TODAY);
    expect(brief.generatedAt).toBeDefined();
    expect(typeof brief.generatedAt).toBe("string");
  });

  it("stakeholders includes champion from graph", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
    });
    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, SLUG, "Enterprise License", TODAY);
    const champion = brief.stakeholders.people.find((p) => p.role === "champion");
    expect(champion).toBeDefined();
  });

  it("riskScore is a number between 0 and 100", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
    });
    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, SLUG, "Enterprise License", TODAY);
    expect(brief.riskScore).toBeGreaterThanOrEqual(0);
    expect(brief.riskScore).toBeLessThanOrEqual(100);
  });

  it("topPriorities is a non-empty array of strings", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
    });
    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, SLUG, "Enterprise License", TODAY);
    expect(Array.isArray(brief.topPriorities)).toBe(true);
    expect(brief.topPriorities.length).toBeGreaterThan(0);
  });

  it("executiveSummary is a non-empty string", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
    });
    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, SLUG, "Enterprise License", TODAY);
    expect(typeof brief.executiveSummary).toBe("string");
    expect(brief.executiveSummary.length).toBeGreaterThan(10);
  });

  it("works with empty graph (no crash)", async () => {
    vol.fromJSON({});
    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, SLUG, "Test Deal", TODAY);
    expect(brief.slug).toBe(SLUG);
    expect(brief.stakeholders.people).toHaveLength(0);
  });

  it("dealHealth is an array (may be empty)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
    });
    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, SLUG, "Enterprise License", TODAY);
    expect(Array.isArray(brief.dealHealth)).toBe(true);
  });
});

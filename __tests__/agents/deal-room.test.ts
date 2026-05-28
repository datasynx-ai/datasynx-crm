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
  return `| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |
|------|-------|-------|----------|-------------|------------|-------|---------|
| Enterprise License | proposal | 150000 | EUR | 60 | 2026-06-30 |  | 2026-05-25 |
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

  it("champion-aware daysSinceContact: uses champion email to look up contact health", async () => {
    const health = JSON.stringify({
      schemaVersion: "1",
      slug: SLUG,
      overallHealth: 72,
      updatedAt: new Date().toISOString(),
      contacts: [
        {
          contactId: "person:max@acme.com",
          name: "Max Müller",
          email: "max@acme.com",
          score: 85,
          grade: "A",
          trend: "stable",
          daysSinceContact: 5,
          avgCadenceDays: 7,
          sentimentTrend: 0,
          riskFlags: [],
          lastContact: "2026-05-23",
          interactionCount30d: 3,
          recommendation: "On track",
          updatedAt: new Date().toISOString(),
        },
        {
          contactId: "person:other@acme.com",
          name: "Other Person",
          email: "other@acme.com",
          score: 10,
          grade: "F",
          trend: "cold",
          daysSinceContact: 999,
          avgCadenceDays: 0,
          sentimentTrend: 0,
          riskFlags: ["NO_CONTACT_30D"],
          lastContact: "2026-01-01",
          interactionCount30d: 0,
          recommendation: "Re-engage",
          updatedAt: new Date().toISOString(),
        },
      ],
      atRiskContacts: [],
      coldContacts: [],
    });
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: health,
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
    });
    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, SLUG, "Enterprise License", TODAY);
    // Champion (max@acme.com) has daysSinceContact=5, not the first contact's 999
    // riskScore should reflect champion's health (85), not fallback cold contact
    expect(brief.riskScore).toBeLessThan(60); // champion present, no critical missing roles aside from economic_buyer
    expect(brief.stakeholders.people.find((p) => p.role === "champion")?.name).toBe("Max Müller");
  });

  it("overflow: shows +N more when >3 deals are at-risk", async () => {
    const manyDealsMd = `| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |
|------|-------|-------|----------|-------------|------------|-------|---------|
| Deal A | proposal | 10000 | EUR | 10 |  |  | 2025-01-01 |
| Deal B | proposal | 20000 | EUR | 10 |  |  | 2025-01-01 |
| Deal C | proposal | 30000 | EUR | 10 |  |  | 2025-01-01 |
| Deal D | proposal | 40000 | EUR | 10 |  |  | 2025-01-01 |
`;
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: manyDealsMd,
    });
    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, SLUG, "Enterprise License", TODAY);
    const hasOverflow = brief.topPriorities.some((p) => p.startsWith("+"));
    expect(hasOverflow).toBe(true);
  });
});

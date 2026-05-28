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

function makeGraphJson(overrides: object = {}): string {
  return JSON.stringify({
    schemaVersion: "1",
    slug: SLUG,
    nodes: [
      {
        id: "person:max@acme.com",
        type: "person",
        label: "Max Müller",
        properties: { email: "max@acme.com", title: "Head of Engineering" },
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-05-20T00:00:00Z",
      },
      {
        id: "person:sarah@acme.com",
        type: "person",
        label: "Sarah Schmidt",
        properties: { email: "sarah@acme.com", title: "CFO" },
        createdAt: "2026-02-01T00:00:00Z",
        updatedAt: "2026-05-10T00:00:00Z",
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
        contactCount: 8,
        properties: {},
      },
    ],
    updatedAt: "2026-05-20T00:00:00Z",
    ...overrides,
  });
}

function makeHealthJson(): string {
  return JSON.stringify({
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
        daysSinceContact: 8,
        avgCadenceDays: 7,
        sentimentTrend: 0,
        riskFlags: [],
        lastContact: "2026-05-20",
        interactionCount30d: 4,
        recommendation: "On schedule",
        updatedAt: new Date().toISOString(),
      },
      {
        contactId: "person:sarah@acme.com",
        name: "Sarah Schmidt",
        email: "sarah@acme.com",
        score: 15,
        grade: "F",
        trend: "cold",
        daysSinceContact: 45,
        avgCadenceDays: 0,
        sentimentTrend: 0,
        riskFlags: ["NO_CONTACT_14D", "NO_CONTACT_30D"],
        lastContact: "2026-04-13",
        interactionCount30d: 0,
        recommendation: "Urgently re-engage",
        updatedAt: new Date().toISOString(),
      },
    ],
    atRiskContacts: [],
    coldContacts: [],
  });
}

// ─── buildStakeholderMap ──────────────────────────────────────────────────────

describe("buildStakeholderMap", () => {
  it("returns slug and updatedAt", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { buildStakeholderMap } = await import("../../src/core/org-intelligence.js");
    const result = buildStakeholderMap(DATA_DIR, SLUG, TODAY);
    expect(result.slug).toBe(SLUG);
    expect(result.updatedAt).toBeDefined();
  });

  it("includes champion in people with role champion", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { buildStakeholderMap } = await import("../../src/core/org-intelligence.js");
    const result = buildStakeholderMap(DATA_DIR, SLUG, TODAY);
    const champion = result.people.find((p) => p.role === "champion");
    expect(champion).toBeDefined();
    expect(champion!.name).toBe("Max Müller");
  });

  it("maps health score to profile score", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { buildStakeholderMap } = await import("../../src/core/org-intelligence.js");
    const result = buildStakeholderMap(DATA_DIR, SLUG, TODAY);
    const max = result.people.find((p) => p.email === "max@acme.com");
    expect(max!.healthScore).toBe(85);
    expect(max!.daysSinceContact).toBe(8);
  });

  it("identifies missing economic_buyer when none in graph", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { buildStakeholderMap } = await import("../../src/core/org-intelligence.js");
    const result = buildStakeholderMap(DATA_DIR, SLUG, TODAY);
    const missing = result.missingRoles.find((m) => m.role === "economic_buyer");
    expect(missing).toBeDefined();
    expect(missing!.urgency).toBe("critical");
  });

  it("generates non-empty recommendation", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { buildStakeholderMap } = await import("../../src/core/org-intelligence.js");
    const result = buildStakeholderMap(DATA_DIR, SLUG, TODAY);
    expect(typeof result.recommendation).toBe("string");
    expect(result.recommendation.length).toBeGreaterThan(0);
  });

  it("returns empty people when graph has no person nodes", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: JSON.stringify({
        schemaVersion: "1", slug: SLUG, nodes: [], edges: [], updatedAt: new Date().toISOString(),
      }),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { buildStakeholderMap } = await import("../../src/core/org-intelligence.js");
    const result = buildStakeholderMap(DATA_DIR, SLUG, TODAY);
    expect(result.people).toHaveLength(0);
  });

  it("works when health.json does not exist (falls back to empty)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
    });
    const { buildStakeholderMap } = await import("../../src/core/org-intelligence.js");
    const result = buildStakeholderMap(DATA_DIR, SLUG, TODAY);
    expect(result.people.length).toBeGreaterThan(0);
  });

  it("marks nodes with NO_CONTACT_30D as silent in riskFlags", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { buildStakeholderMap } = await import("../../src/core/org-intelligence.js");
    const result = buildStakeholderMap(DATA_DIR, SLUG, TODAY);
    const sarah = result.people.find((p) => p.email === "sarah@acme.com");
    expect(sarah!.riskFlags).toContain("NO_CONTACT_30D");
  });
});

// ─── buildRiskAssessment ──────────────────────────────────────────────────────

describe("buildRiskAssessment", () => {
  it("mentions no champion risk when champion missing", async () => {
    const { buildRiskAssessment } = await import("../../src/core/org-intelligence.js");
    const assessment = buildRiskAssessment([], [{ role: "champion" as const, urgency: "important" as const, suggestion: "Find a champion" }], []);
    expect(assessment.toLowerCase()).toContain("champion");
  });

  it("mentions cold contact risk when relevant profile present", async () => {
    const { buildRiskAssessment } = await import("../../src/core/org-intelligence.js");
    const coldProfile = {
      name: "Cold Person",
      role: "economic_buyer" as const,
      healthScore: 10,
      daysSinceContact: 45,
      contactStrength: 0.1,
      riskFlags: ["NO_CONTACT_30D"],
    };
    const assessment = buildRiskAssessment([coldProfile], [], []);
    expect(assessment.length).toBeGreaterThan(0);
  });
});

// E2E tests for D19 — Multi-Agent Deal Room full workflow
// Covers: buildDealRoom → DealRoomBrief, open_deal_room MCP tool
import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

// LanceDB mock (search not needed for deal room)
vi.mock("@lancedb/lancedb", () => ({
  connect: vi.fn().mockResolvedValue({ tableNames: vi.fn().mockResolvedValue([]) }),
}));

const DATA_DIR = "/data";
const TODAY = "2026-05-28";

function seedCustomer(slug: string, extra: Record<string, string> = {}) {
  vol.fromJSON({
    [`${DATA_DIR}/customers/${slug}/main_facts.md`]: [
      `name: Acme Corp`,
      `domain: acme.com`,
      `industry: SaaS`,
    ].join("\n"),
    [`${DATA_DIR}/customers/${slug}/interactions.md`]: "",
    ...extra,
  });
}

function seedPipeline(slug: string, closeDate = "2026-07-01") {
  return {
    [`${DATA_DIR}/customers/${slug}/pipeline.md`]: [
      "# Pipeline",
      "",
      "| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |",
      "|------|-------|-------|----------|-------------|------------|-------|---------|",
      `| Enterprise License | proposal | 80000 |  | 0.6 | ${closeDate} |  | ${TODAY} |`,
    ].join("\n"),
  };
}

function seedGraph(slug: string) {
  const now = new Date().toISOString();
  return {
    [`${DATA_DIR}/customers/${slug}/graph.json`]: JSON.stringify({
      schemaVersion: "1",
      slug,
      updatedAt: now,
      nodes: [
        { id: "person:alice@acme.com", type: "person", label: "Alice Smith", properties: { email: "alice@acme.com" }, createdAt: now, updatedAt: now },
        { id: "person:bob@acme.com", type: "person", label: "Bob Jones", properties: { email: "bob@acme.com" }, createdAt: now, updatedAt: now },
      ],
      edges: [
        { id: "e1", from: "person:alice@acme.com", to: "person:bob@acme.com", type: "KNOWS", weight: 0.8, contactCount: 3, createdAt: now, updatedAt: now },
      ],
    }),
  };
}

function seedHealth(slug: string) {
  const now = new Date().toISOString();
  return {
    [`${DATA_DIR}/customers/${slug}/health.json`]: JSON.stringify({
      schemaVersion: "1",
      slug,
      overallHealth: 75,
      updatedAt: now,
      contacts: [{
        contactId: "person:alice@acme.com",
        name: "Alice Smith",
        email: "alice@acme.com",
        score: 75,
        grade: "B",
        trend: "stable",
        daysSinceContact: 7,
        avgCadenceDays: 14,
        sentimentTrend: 0.5,
        riskFlags: [],
        lastContact: "2026-05-21",
        interactionCount30d: 4,
        recommendation: "Good cadence — schedule next check-in",
        updatedAt: now,
      }],
    }),
  };
}

describe("buildDealRoom", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns a complete DealRoomBrief with all required fields", async () => {
    seedCustomer("acme", { ...seedPipeline("acme"), ...seedGraph("acme"), ...seedHealth("acme") });

    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, "acme", "Enterprise License", TODAY);

    expect(brief.slug).toBe("acme");
    expect(brief.dealName).toBe("Enterprise License");
    expect(typeof brief.generatedAt).toBe("string");
    expect(typeof brief.executiveSummary).toBe("string");
    expect(brief.executiveSummary.length).toBeGreaterThan(0);
    expect(Array.isArray(brief.topPriorities)).toBe(true);
    expect(typeof brief.riskScore).toBe("number");
  });

  it("includes stakeholder map from graph", async () => {
    seedCustomer("acme", { ...seedGraph("acme"), ...seedHealth("acme") });

    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, "acme", "Deal", TODAY);

    expect(brief.stakeholders.slug).toBe("acme");
    expect(Array.isArray(brief.stakeholders.people)).toBe(true);
  });

  it("includes relationship health from health.json", async () => {
    seedCustomer("acme", { ...seedHealth("acme") });

    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, "acme", "Deal", TODAY);

    expect(Array.isArray(brief.relationshipHealth)).toBe(true);
    expect(brief.relationshipHealth).toHaveLength(1);
    expect(brief.relationshipHealth[0]!.name).toBe("Alice Smith");
  });

  it("includes deal health scores for active deals", async () => {
    seedCustomer("acme", { ...seedPipeline("acme") });

    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, "acme", "Enterprise License", TODAY);

    expect(Array.isArray(brief.dealHealth)).toBe(true);
    expect(brief.dealHealth.length).toBeGreaterThan(0);
    expect(typeof brief.dealHealth[0]!.score).toBe("number");
  });

  it("includes revenue simulation with p50/p10/p90", async () => {
    seedCustomer("acme", { ...seedPipeline("acme") });

    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, "acme", "Deal", TODAY);

    expect(typeof brief.revenueSimulation.p50).toBe("number");
    expect(typeof brief.revenueSimulation.p10).toBe("number");
    expect(typeof brief.revenueSimulation.p90).toBe("number");
    expect(brief.revenueSimulation.p10).toBeLessThanOrEqual(brief.revenueSimulation.p50);
    expect(brief.revenueSimulation.p50).toBeLessThanOrEqual(brief.revenueSimulation.p90);
  });

  it("returns null recommendedPlaybook when no playbooks exist", async () => {
    seedCustomer("acme");

    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, "acme", "Deal", TODAY);

    expect(brief.recommendedPlaybook).toBeNull();
  });

  it("works without graph.json — stakeholders empty, no error", async () => {
    seedCustomer("acme");

    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, "acme", "Deal", TODAY);

    expect(Array.isArray(brief.stakeholders.people)).toBe(true);
    expect(brief.stakeholders.people).toHaveLength(0);
  });

  it("works without pipeline.md — dealHealth empty", async () => {
    seedCustomer("acme");

    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, "acme", "Deal", TODAY);

    expect(brief.dealHealth).toHaveLength(0);
  });

  it("excludes won/lost deals from dealHealth", async () => {
    const now = new Date().toISOString();
    seedCustomer("acme", {
      [`${DATA_DIR}/customers/acme/pipeline.md`]: [
        "# Pipeline",
        "",
        "| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |",
        "|------|-------|-------|----------|-------------|------------|-------|---------|",
        `| Won Deal | won | 10000 |  |  |  |  | ${TODAY} |`,
        `| Lost Deal | lost | 5000 |  |  |  |  | ${TODAY} |`,
        `| Active Deal | proposal | 20000 |  | 0.5 | 2026-08-01 |  | ${TODAY} |`,
      ].join("\n"),
    });

    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, "acme", "Active Deal", TODAY);

    expect(brief.dealHealth.every((d) => d.stage !== "won" && d.stage !== "lost")).toBe(true);
    expect(brief.dealHealth).toHaveLength(1);
  });

  it("topPriorities is non-empty array", async () => {
    seedCustomer("acme", { ...seedPipeline("acme") });

    const { buildDealRoom } = await import("../../src/agents/deal-room.js");
    const brief = await buildDealRoom(DATA_DIR, "acme", "Enterprise License", TODAY);

    expect(brief.topPriorities.length).toBeGreaterThan(0);
  });
});

describe("open_deal_room MCP tool", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns text content with JSON brief", async () => {
    seedCustomer("acme");

    const { handleOpenDealRoom } = await import("../../src/mcp/tools/open-deal-room.js");
    const result = await handleOpenDealRoom({ slug: "acme", dealName: "Test Deal" }, DATA_DIR);

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(typeof result.content[0]!.text).toBe("string");
    expect(result.content[0]!.text.length).toBeGreaterThan(10);
  });

  it("returns valid JSON in text content", async () => {
    seedCustomer("acme");

    const { handleOpenDealRoom } = await import("../../src/mcp/tools/open-deal-room.js");
    const result = await handleOpenDealRoom({ slug: "acme", dealName: "Test Deal" }, DATA_DIR);

    expect(() => JSON.parse(result.content[0]!.text)).not.toThrow();
  });

  it("brief JSON contains slug and dealName", async () => {
    seedCustomer("acme");

    const { handleOpenDealRoom } = await import("../../src/mcp/tools/open-deal-room.js");
    const result = await handleOpenDealRoom({ slug: "acme", dealName: "My Deal" }, DATA_DIR);

    const parsed = JSON.parse(result.content[0]!.text) as { slug: string; dealName: string };
    expect(parsed.slug).toBe("acme");
    expect(parsed.dealName).toBe("My Deal");
  });
});


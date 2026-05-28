import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";

function makeGraphJson(): string {
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
  });
}

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe("handleGetOrgIntelligence", () => {
  it("returns slug in result", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson() });
    const { handleGetOrgIntelligence } = await import("../../../src/mcp/tools/get-org-intelligence.js");
    const result = await handleGetOrgIntelligence({ slug: SLUG }, DATA_DIR);
    const parsed = parseResult(result);
    expect(parsed["slug"]).toBe(SLUG);
  });

  it("returns people array with champion", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson() });
    const { handleGetOrgIntelligence } = await import("../../../src/mcp/tools/get-org-intelligence.js");
    const result = await handleGetOrgIntelligence({ slug: SLUG }, DATA_DIR);
    const parsed = parseResult(result);
    const people = parsed["people"] as Array<{ role: string; name: string }>;
    expect(Array.isArray(people)).toBe(true);
    const champion = people.find((p) => p.role === "champion");
    expect(champion).toBeDefined();
  });

  it("returns missingRoles array", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson() });
    const { handleGetOrgIntelligence } = await import("../../../src/mcp/tools/get-org-intelligence.js");
    const result = await handleGetOrgIntelligence({ slug: SLUG }, DATA_DIR);
    const parsed = parseResult(result);
    expect(Array.isArray(parsed["missingRoles"])).toBe(true);
  });

  it("returns empty people when slug not found (readGraph falls back to emptyGraph)", async () => {
    vol.fromJSON({});
    const { handleGetOrgIntelligence } = await import("../../../src/mcp/tools/get-org-intelligence.js");
    const result = await handleGetOrgIntelligence({ slug: "no-such-slug" }, DATA_DIR);
    const parsed = parseResult(result);
    expect(parsed["people"]).toBeDefined();
    expect((parsed["people"] as unknown[]).length).toBe(0);
  });

  it("handles malformed graph.json gracefully", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: "{ not valid json",
    });
    const { handleGetOrgIntelligence } = await import("../../../src/mcp/tools/get-org-intelligence.js");
    // readGraph catches parse errors and returns emptyGraph — should not throw
    const result = await handleGetOrgIntelligence({ slug: SLUG }, DATA_DIR);
    const parsed = parseResult(result);
    expect(parsed["slug"]).toBe(SLUG);
    expect((parsed["people"] as unknown[]).length).toBe(0);
  });

  it("includes dealName in result when provided", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
    });
    const { handleGetOrgIntelligence } = await import("../../../src/mcp/tools/get-org-intelligence.js");
    const result = await handleGetOrgIntelligence({ slug: SLUG, dealName: "Enterprise 2026" }, DATA_DIR);
    const parsed = parseResult(result);
    expect(parsed["dealName"]).toBe("Enterprise 2026");
  });
});

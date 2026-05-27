import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";
const TODAY = "2026-05-27";

function healthJson(overrides: object = {}) {
  return JSON.stringify({
    schemaVersion: "1",
    slug: SLUG,
    contacts: [],
    overallHealth: 42,
    updatedAt: new Date().toISOString(), // fresh
    ...overrides,
  });
}

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe("handleGetRelationshipHealth", () => {
  it("returns overallHealth 100 and empty contacts when no interactions exist", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { handleGetRelationshipHealth } = await import("../../../src/mcp/tools/get-relationship-health.js");
    const result = await handleGetRelationshipHealth({ slug: SLUG }, DATA_DIR);
    const parsed = parseResult(result);
    expect(parsed["overallHealth"]).toBe(100);
    expect(Array.isArray(parsed["contacts"])).toBe(true);
    expect((parsed["contacts"] as unknown[]).length).toBe(0);
  });

  it("returns contacts array with health data when interactions exist", async () => {
    const md = `## 2026-05-27 · Call\n**With:** max@acme.com\n**Summary:** Test.\n**Next Steps:**\n- [ ] —\n**Source:** agent://1\n**Synced:** 2026-05-27T10:00:00.000Z\n---\n`;
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: md });
    const { handleGetRelationshipHealth } = await import("../../../src/mcp/tools/get-relationship-health.js");
    const result = await handleGetRelationshipHealth({ slug: SLUG }, DATA_DIR);
    const parsed = parseResult(result);
    expect((parsed["contacts"] as unknown[]).length).toBeGreaterThan(0);
  });

  it("atRiskContacts contains contacts with riskFlags", async () => {
    // Old interaction → NO_CONTACT_30D flag
    const md = `## 2026-04-01 · Call\n**With:** max@acme.com\n**Summary:** Old.\n**Next Steps:**\n- [ ] —\n**Source:** agent://1\n**Synced:** 2026-04-01T10:00:00.000Z\n---\n`;
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: md });
    const { handleGetRelationshipHealth } = await import("../../../src/mcp/tools/get-relationship-health.js");
    const result = await handleGetRelationshipHealth({ slug: SLUG }, DATA_DIR);
    const parsed = parseResult(result);
    expect((parsed["atRiskContacts"] as string[]).length).toBeGreaterThan(0);
  });

  it("coldContacts contains contacts with trend = cold", async () => {
    // Very old interaction → trend=cold
    const md = `## 2026-04-01 · Call\n**With:** max@acme.com\n**Summary:** Old.\n**Next Steps:**\n- [ ] —\n**Source:** agent://1\n**Synced:** 2026-04-01T10:00:00.000Z\n---\n`;
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: md });
    const { handleGetRelationshipHealth } = await import("../../../src/mcp/tools/get-relationship-health.js");
    const result = await handleGetRelationshipHealth({ slug: SLUG }, DATA_DIR);
    const parsed = parseResult(result);
    expect((parsed["coldContacts"] as string[]).length).toBeGreaterThan(0);
  });

  it("reads from health.json when fresh (< 1h old)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: healthJson({ overallHealth: 42 }),
    });
    const { handleGetRelationshipHealth } = await import("../../../src/mcp/tools/get-relationship-health.js");
    const result = await handleGetRelationshipHealth({ slug: SLUG }, DATA_DIR);
    const parsed = parseResult(result);
    expect(parsed["overallHealth"]).toBe(42);
  });

  it("recomputes when health.json is stale (updatedAt > 1h ago)", async () => {
    const staleTime = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: healthJson({
        overallHealth: 42,
        updatedAt: staleTime,
      }),
    });
    const { handleGetRelationshipHealth } = await import("../../../src/mcp/tools/get-relationship-health.js");
    const result = await handleGetRelationshipHealth({ slug: SLUG }, DATA_DIR);
    const parsed = parseResult(result);
    // Recomputed from empty interactions → overallHealth = 100, not 42
    expect(parsed["overallHealth"]).toBe(100);
  });

  it("recomputes when health.json does not exist", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { handleGetRelationshipHealth } = await import("../../../src/mcp/tools/get-relationship-health.js");
    const result = await handleGetRelationshipHealth({ slug: SLUG }, DATA_DIR);
    const parsed = parseResult(result);
    expect(typeof parsed["overallHealth"]).toBe("number");
  });

  it("includes slug in response", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { handleGetRelationshipHealth } = await import("../../../src/mcp/tools/get-relationship-health.js");
    const result = await handleGetRelationshipHealth({ slug: SLUG }, DATA_DIR);
    const parsed = parseResult(result);
    expect(parsed["slug"]).toBe(SLUG);
  });

  it("returns success:false on unexpected error", async () => {
    // Pass a slug that might cause issues — still returns a valid response (empty graph)
    // For a genuine error we need to induce one: pass undefined dataDir triggers path.join
    const { handleGetRelationshipHealth } = await import("../../../src/mcp/tools/get-relationship-health.js");
    // Trigger error by passing invalid dataDir type
    const result = await handleGetRelationshipHealth({ slug: SLUG }, null as unknown as string);
    const parsed = parseResult(result);
    expect(parsed["success"]).toBe(false);
  });
});

describe("registerGetRelationshipHealth — MCP registration", () => {
  it("registers tool with name get_relationship_health", async () => {
    const { registerGetRelationshipHealth } = await import("../../../src/mcp/tools/get-relationship-health.js");
    const registeredTools: string[] = [];
    const fakeServer = {
      registerTool: (name: string) => { registeredTools.push(name); },
    };
    registerGetRelationshipHealth(fakeServer as never);
    expect(registeredTools).toContain("get_relationship_health");
  });
});

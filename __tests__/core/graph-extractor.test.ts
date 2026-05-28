import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";

// ─── extractEmail ─────────────────────────────────────────────────────────────

describe("extractEmail", () => {
  it("extracts email from angle-bracket format", async () => {
    const { extractEmail } = await import("../../src/core/graph-extractor.js");
    expect(extractEmail("Max Müller <max@acme.com>")).toBe("max@acme.com");
  });

  it("extracts bare email", async () => {
    const { extractEmail } = await import("../../src/core/graph-extractor.js");
    expect(extractEmail("max@acme.com")).toBe("max@acme.com");
  });

  it("returns undefined for plain name", async () => {
    const { extractEmail } = await import("../../src/core/graph-extractor.js");
    expect(extractEmail("Max Müller")).toBeUndefined();
  });

  it("lowercases the email", async () => {
    const { extractEmail } = await import("../../src/core/graph-extractor.js");
    expect(extractEmail("MAX@ACME.COM")).toBe("max@acme.com");
    expect(extractEmail("Alice <Alice@Acme.COM>")).toBe("alice@acme.com");
  });
});

// ─── extractDisplayName ───────────────────────────────────────────────────────

describe("extractDisplayName", () => {
  it("extracts name from angle-bracket format", async () => {
    const { extractDisplayName } = await import("../../src/core/graph-extractor.js");
    expect(extractDisplayName("Max Müller <max@acme.com>")).toBe("Max Müller");
  });

  it("returns full string for bare email", async () => {
    const { extractDisplayName } = await import("../../src/core/graph-extractor.js");
    expect(extractDisplayName("max@acme.com")).toBe("max@acme.com");
  });

  it("returns trimmed name for plain string", async () => {
    const { extractDisplayName } = await import("../../src/core/graph-extractor.js");
    expect(extractDisplayName("  Max Müller  ")).toBe("Max Müller");
  });
});

// ─── makePersonId ─────────────────────────────────────────────────────────────

describe("makePersonId", () => {
  it("uses email when present", async () => {
    const { makePersonId } = await import("../../src/core/graph-extractor.js");
    expect(makePersonId("max@acme.com", SLUG)).toBe("person:max@acme.com");
  });

  it("uses email from angle-bracket format", async () => {
    const { makePersonId } = await import("../../src/core/graph-extractor.js");
    expect(makePersonId("Max Müller <max@acme.com>", SLUG)).toBe("person:max@acme.com");
  });

  it("uses slug+nameSlug when no email", async () => {
    const { makePersonId } = await import("../../src/core/graph-extractor.js");
    const id = makePersonId("Max Müller", SLUG);
    expect(id).toMatch(/^person:acme-corp:/);
  });

  it("is idempotent — same input produces same id", async () => {
    const { makePersonId } = await import("../../src/core/graph-extractor.js");
    const id1 = makePersonId("Max Müller", SLUG);
    const id2 = makePersonId("Max Müller", SLUG);
    expect(id1).toBe(id2);
  });

  it("lowercases email in id", async () => {
    const { makePersonId } = await import("../../src/core/graph-extractor.js");
    expect(makePersonId("MAX@ACME.COM", SLUG)).toBe("person:max@acme.com");
  });

  it("display-name with uppercase email produces same id as bare lowercase", async () => {
    const { makePersonId } = await import("../../src/core/graph-extractor.js");
    const a = makePersonId("Alice Smith <ALICE@ACME.COM>", SLUG);
    const b = makePersonId("alice@acme.com", SLUG);
    expect(a).toBe(b);
  });

  it("quoted display-name format normalizes correctly", async () => {
    const { makePersonId } = await import("../../src/core/graph-extractor.js");
    const a = makePersonId('"Müller, Hans" <hans@acme.de>', SLUG);
    const b = makePersonId("hans@acme.de", SLUG);
    expect(a).toBe(b);
  });
});

// ─── makeCompanyId ────────────────────────────────────────────────────────────

describe("makeCompanyId", () => {
  it("uses domain when provided", async () => {
    const { makeCompanyId } = await import("../../src/core/graph-extractor.js");
    expect(makeCompanyId("acme.com", SLUG, "Acme Corp")).toBe("company:acme.com");
  });

  it("uses slug when no domain", async () => {
    const { makeCompanyId } = await import("../../src/core/graph-extractor.js");
    expect(makeCompanyId(undefined, SLUG, "Acme Corp")).toBe("company:acme-corp");
  });

  it("lowercases domain", async () => {
    const { makeCompanyId } = await import("../../src/core/graph-extractor.js");
    expect(makeCompanyId("ACME.COM", SLUG)).toBe("company:acme.com");
  });
});

// ─── extractNodes ─────────────────────────────────────────────────────────────

describe("extractNodes", () => {
  it("returns 1 node when no domain or companyName", async () => {
    const { extractNodes } = await import("../../src/core/graph-extractor.js");
    const nodes = extractNodes({ slug: SLUG, withStr: "Max Müller", interactionDate: "2026-05-27" });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.type).toBe("person");
  });

  it("returns 2 nodes (person + company) when domain is provided", async () => {
    const { extractNodes } = await import("../../src/core/graph-extractor.js");
    const nodes = extractNodes({ slug: SLUG, withStr: "Max Müller", interactionDate: "2026-05-27", domain: "acme.com" });
    expect(nodes).toHaveLength(2);
    expect(nodes.some((n) => n.type === "company")).toBe(true);
  });

  it("returns 2 nodes when only companyName is provided", async () => {
    const { extractNodes } = await import("../../src/core/graph-extractor.js");
    const nodes = extractNodes({ slug: SLUG, withStr: "Max", interactionDate: "2026-05-27", companyName: "Acme Corp" });
    expect(nodes).toHaveLength(2);
  });

  it("person node has correct id, label, email property", async () => {
    const { extractNodes } = await import("../../src/core/graph-extractor.js");
    const nodes = extractNodes({ slug: SLUG, withStr: "Max Müller <max@acme.com>", interactionDate: "2026-05-27" });
    const person = nodes[0]!;
    expect(person.id).toBe("person:max@acme.com");
    expect(person.label).toBe("Max Müller");
    expect(person.properties["email"]).toBe("max@acme.com");
  });

  it("company node has type company and domain property", async () => {
    const { extractNodes } = await import("../../src/core/graph-extractor.js");
    const nodes = extractNodes({ slug: SLUG, withStr: "Max", interactionDate: "2026-05-27", domain: "acme.com" });
    const company = nodes.find((n) => n.type === "company");
    expect(company).toBeDefined();
    expect(company!.id).toBe("company:acme.com");
    expect(company!.properties["domain"]).toBe("acme.com");
  });
});

// ─── extractEdges ─────────────────────────────────────────────────────────────

describe("extractEdges", () => {
  it("returns empty array when no companyId", async () => {
    const { extractEdges } = await import("../../src/core/graph-extractor.js");
    expect(extractEdges("person:a", undefined, "2026-05-27")).toEqual([]);
  });

  it("returns WORKS_AT edge between person and company", async () => {
    const { extractEdges } = await import("../../src/core/graph-extractor.js");
    const edges = extractEdges("person:max@acme.com", "company:acme.com", "2026-05-27");
    expect(edges).toHaveLength(1);
    expect(edges[0]!.type).toBe("WORKS_AT");
    expect(edges[0]!.from).toBe("person:max@acme.com");
    expect(edges[0]!.to).toBe("company:acme.com");
  });

  it("edge has deterministic id", async () => {
    const { extractEdges } = await import("../../src/core/graph-extractor.js");
    const edges = extractEdges("person:a@b.com", "company:b.com", "2026-05-27");
    expect(edges[0]!.id).toBe("WORKS_AT:person:a@b.com__company:b.com");
  });
});

// ─── updateGraphFromInteraction ───────────────────────────────────────────────

describe("updateGraphFromInteraction", () => {
  it("creates graph.json when it does not exist", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { updateGraphFromInteraction } = await import("../../src/core/graph-extractor.js");
    await updateGraphFromInteraction(DATA_DIR, SLUG, { withStr: "Max Müller", interactionDate: "2026-05-27" });
    const { readGraph } = await import("../../src/core/graph.js");
    const g = readGraph(DATA_DIR, SLUG);
    expect(g.nodes.length).toBeGreaterThan(0);
  });

  it("adds person node from with field", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { updateGraphFromInteraction } = await import("../../src/core/graph-extractor.js");
    await updateGraphFromInteraction(DATA_DIR, SLUG, { withStr: "Max <max@acme.com>", interactionDate: "2026-05-27" });
    const { readGraph } = await import("../../src/core/graph.js");
    const g = readGraph(DATA_DIR, SLUG);
    expect(g.nodes.some((n) => n.id === "person:max@acme.com")).toBe(true);
  });

  it("adds company node when main_facts.md has domain", async () => {
    const mainFacts = `---\nname: Acme Corp\ndomain: acme.com\n---\n`;
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/main_facts.md`]: mainFacts,
    });
    const { updateGraphFromInteraction } = await import("../../src/core/graph-extractor.js");
    await updateGraphFromInteraction(DATA_DIR, SLUG, { withStr: "Max", interactionDate: "2026-05-27" });
    const { readGraph } = await import("../../src/core/graph.js");
    const g = readGraph(DATA_DIR, SLUG);
    expect(g.nodes.some((n) => n.type === "company")).toBe(true);
  });

  it("adds WORKS_AT edge when company node is available", async () => {
    const mainFacts = `---\nname: Acme Corp\ndomain: acme.com\n---\n`;
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/main_facts.md`]: mainFacts,
    });
    const { updateGraphFromInteraction } = await import("../../src/core/graph-extractor.js");
    await updateGraphFromInteraction(DATA_DIR, SLUG, { withStr: "max@acme.com", interactionDate: "2026-05-27" });
    const { readGraph } = await import("../../src/core/graph.js");
    const g = readGraph(DATA_DIR, SLUG);
    expect(g.edges.some((e) => e.type === "WORKS_AT")).toBe(true);
  });

  it("increments contactCount on repeated call with same person", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { updateGraphFromInteraction } = await import("../../src/core/graph-extractor.js");
    await updateGraphFromInteraction(DATA_DIR, SLUG, { withStr: "max@acme.com", interactionDate: "2026-05-27" });
    // Reset modules to get fresh imports but keep vol state
    vi.resetModules();
    const { updateGraphFromInteraction: update2 } = await import("../../src/core/graph-extractor.js");
    await update2(DATA_DIR, SLUG, { withStr: "max@acme.com", interactionDate: "2026-05-28" });
    vi.resetModules();
    const { readGraph } = await import("../../src/core/graph.js");
    const g = readGraph(DATA_DIR, SLUG);
    // person node exists (upserted twice)
    expect(g.nodes.filter((n) => n.id === "person:max@acme.com")).toHaveLength(1);
  });

  it("does not throw when main_facts.md is missing", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { updateGraphFromInteraction } = await import("../../src/core/graph-extractor.js");
    await expect(
      updateGraphFromInteraction(DATA_DIR, SLUG, { withStr: "Max", interactionDate: "2026-05-27" })
    ).resolves.not.toThrow();
  });

  it("does not throw when customers dir does not exist", async () => {
    vol.fromJSON({});
    const { updateGraphFromInteraction } = await import("../../src/core/graph-extractor.js");
    await expect(
      updateGraphFromInteraction(DATA_DIR, SLUG, { withStr: "Max", interactionDate: "2026-05-27" })
    ).resolves.not.toThrow();
  });

  it("skips update when withStr is empty", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { updateGraphFromInteraction } = await import("../../src/core/graph-extractor.js");
    await updateGraphFromInteraction(DATA_DIR, SLUG, { withStr: "  ", interactionDate: "2026-05-27" });
    const { readGraph } = await import("../../src/core/graph.js");
    const g = readGraph(DATA_DIR, SLUG);
    expect(g.nodes).toHaveLength(0);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";

// ─── readGraph / writeGraph ───────────────────────────────────────────────────

describe("readGraph", () => {
  it("returns empty graph when file does not exist", async () => {
    const { readGraph } = await import("../../src/core/graph.js");
    const g = readGraph(DATA_DIR, SLUG);
    expect(g.schemaVersion).toBe("1");
    expect(g.slug).toBe(SLUG);
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
  });

  it("parses existing graph from file", async () => {
    const stored = {
      schemaVersion: "1",
      slug: SLUG,
      nodes: [{ id: "person:a@b.com", type: "person", label: "Alice", properties: { email: "a@b.com" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
      edges: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/graph.json`]: JSON.stringify(stored) });
    const { readGraph } = await import("../../src/core/graph.js");
    const g = readGraph(DATA_DIR, SLUG);
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0]!.id).toBe("person:a@b.com");
  });

  it("returns empty graph on corrupted file", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/graph.json`]: "not-json{{" });
    const { readGraph } = await import("../../src/core/graph.js");
    const g = readGraph(DATA_DIR, SLUG);
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
  });
});

describe("writeGraph + readGraph roundtrip", () => {
  it("written graph is readable via memfs", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { readGraph, writeGraph, upsertNode } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertNode(g, { id: "person:x@y.com", type: "person", label: "X", properties: {} });
    await writeGraph(DATA_DIR, SLUG, () => g);
    const g2 = readGraph(DATA_DIR, SLUG);
    expect(g2.nodes).toHaveLength(1);
    expect(g2.nodes[0]!.id).toBe("person:x@y.com");
  });

  it("updatedAt is refreshed on write", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { readGraph, writeGraph } = await import("../../src/core/graph.js");
    const g = readGraph(DATA_DIR, SLUG);
    const before = g.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await writeGraph(DATA_DIR, SLUG, () => g);
    const g2 = readGraph(DATA_DIR, SLUG);
    expect(g2.updatedAt).not.toBe(before);
  });

  it("concurrent writes are serialized without corruption", async () => {
    vol.fromJSON({});
    const { readGraph, writeGraph, upsertNode } = await import("../../src/core/graph.js");
    await Promise.all([
      writeGraph(DATA_DIR, SLUG, (cur) => upsertNode(cur ?? { schemaVersion: "1", slug: SLUG, nodes: [], edges: [], updatedAt: "" }, { id: "person:a@x.com", type: "person", label: "A", properties: {} })),
      writeGraph(DATA_DIR, SLUG, (cur) => upsertNode(cur ?? { schemaVersion: "1", slug: SLUG, nodes: [], edges: [], updatedAt: "" }, { id: "person:b@x.com", type: "person", label: "B", properties: {} })),
      writeGraph(DATA_DIR, SLUG, (cur) => upsertNode(cur ?? { schemaVersion: "1", slug: SLUG, nodes: [], edges: [], updatedAt: "" }, { id: "person:c@x.com", type: "person", label: "C", properties: {} })),
    ]);
    expect(readGraph(DATA_DIR, SLUG).nodes).toHaveLength(3);
  });
});

// ─── upsertNode ───────────────────────────────────────────────────────────────

describe("upsertNode", () => {
  it("adds new node to empty graph", async () => {
    const { readGraph, upsertNode } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertNode(g, { id: "person:a@b.com", type: "person", label: "Alice", properties: { email: "a@b.com" } });
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0]!.id).toBe("person:a@b.com");
  });

  it("merges properties on existing node", async () => {
    const { readGraph, upsertNode } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertNode(g, { id: "person:a@b.com", type: "person", label: "Alice", properties: { email: "a@b.com" } });
    g = upsertNode(g, { id: "person:a@b.com", type: "person", label: "Alice Smith", properties: { title: "CEO" } });
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0]!.label).toBe("Alice Smith");
    expect(g.nodes[0]!.properties["email"]).toBe("a@b.com");
    expect(g.nodes[0]!.properties["title"]).toBe("CEO");
  });

  it("does not duplicate node on repeated upsert", async () => {
    const { readGraph, upsertNode } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertNode(g, { id: "person:a@b.com", type: "person", label: "Alice", properties: {} });
    g = upsertNode(g, { id: "person:a@b.com", type: "person", label: "Alice", properties: {} });
    expect(g.nodes).toHaveLength(1);
  });

  it("updates updatedAt on merge", async () => {
    const { readGraph, upsertNode } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertNode(g, { id: "person:a@b.com", type: "person", label: "Alice", properties: {} });
    const first = g.nodes[0]!.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    g = upsertNode(g, { id: "person:a@b.com", type: "person", label: "Alice Updated", properties: {} });
    expect(g.nodes[0]!.updatedAt).not.toBe(first);
  });

  it("preserves createdAt on merge", async () => {
    const { readGraph, upsertNode } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertNode(g, { id: "person:a@b.com", type: "person", label: "Alice", properties: {} });
    const created = g.nodes[0]!.createdAt;
    g = upsertNode(g, { id: "person:a@b.com", type: "person", label: "Alice 2", properties: {} });
    expect(g.nodes[0]!.createdAt).toBe(created);
  });
});

// ─── upsertEdge ───────────────────────────────────────────────────────────────

describe("upsertEdge", () => {
  it("adds new edge with deterministic id", async () => {
    const { readGraph, upsertEdge } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertEdge(g, { from: "person:a@b.com", to: "company:b.com", type: "WORKS_AT", weight: 0.5, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]!.id).toBe("WORKS_AT:person:a@b.com__company:b.com");
  });

  it("increments contactCount on existing edge", async () => {
    const { readGraph, upsertEdge } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    const base = { from: "person:a@b.com", to: "company:b.com", type: "WORKS_AT" as const, weight: 0.5, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} };
    g = upsertEdge(g, base);
    g = upsertEdge(g, base);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]!.contactCount).toBe(2);
  });

  it("increments weight by 0.05 on existing edge", async () => {
    const { readGraph, upsertEdge } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    const base = { from: "p:a", to: "c:b", type: "KNOWS" as const, weight: 0.5, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} };
    g = upsertEdge(g, base);
    g = upsertEdge(g, base);
    expect(g.edges[0]!.weight).toBeCloseTo(0.55);
  });

  it("weight never exceeds 1.0", async () => {
    const { readGraph, upsertEdge } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    const base = { from: "p:a", to: "c:b", type: "KNOWS" as const, weight: 0.98, sentiment: 0, lastContact: "2026-05-27", contactCount: 20, properties: {} };
    g = upsertEdge(g, base);
    g = upsertEdge(g, base);
    expect(g.edges[0]!.weight).toBeLessThanOrEqual(1.0);
  });

  it("updates lastContact on existing edge", async () => {
    const { readGraph, upsertEdge } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertEdge(g, { from: "p:a", to: "c:b", type: "KNOWS" as const, weight: 0.5, sentiment: 0, lastContact: "2026-01-01", contactCount: 1, properties: {} });
    g = upsertEdge(g, { from: "p:a", to: "c:b", type: "KNOWS" as const, weight: 0.5, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    expect(g.edges[0]!.lastContact).toBe("2026-05-27");
  });

  it("does not duplicate edge on repeated upsert", async () => {
    const { readGraph, upsertEdge } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    const base = { from: "p:a", to: "c:b", type: "KNOWS" as const, weight: 0.5, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} };
    g = upsertEdge(g, base);
    g = upsertEdge(g, base);
    g = upsertEdge(g, base);
    expect(g.edges).toHaveLength(1);
  });
});

// ─── findEdges ────────────────────────────────────────────────────────────────

describe("findEdges", () => {
  it("returns edges by fromId", async () => {
    const { readGraph, upsertEdge, findEdges } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertEdge(g, { from: "p:a", to: "c:b", type: "WORKS_AT" as const, weight: 0.5, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    g = upsertEdge(g, { from: "p:x", to: "c:b", type: "WORKS_AT" as const, weight: 0.5, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    expect(findEdges(g, "p:a")).toHaveLength(1);
    expect(findEdges(g, "p:a")[0]!.from).toBe("p:a");
  });

  it("filters by edge type", async () => {
    const { readGraph, upsertEdge, findEdges } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertEdge(g, { from: "p:a", to: "c:b", type: "WORKS_AT" as const, weight: 0.5, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    g = upsertEdge(g, { from: "p:a", to: "p:x", type: "KNOWS" as const, weight: 0.5, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    expect(findEdges(g, "p:a", "WORKS_AT")).toHaveLength(1);
    expect(findEdges(g, "p:a", "KNOWS")).toHaveLength(1);
  });

  it("returns empty array when no edges match", async () => {
    const { readGraph, findEdges } = await import("../../src/core/graph.js");
    const g = readGraph(DATA_DIR, SLUG);
    expect(findEdges(g, "p:nobody")).toEqual([]);
  });
});

describe("findEdgesTo", () => {
  it("returns edges by toId", async () => {
    const { readGraph, upsertEdge, findEdgesTo } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertEdge(g, { from: "p:a", to: "c:b", type: "WORKS_AT" as const, weight: 0.5, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    g = upsertEdge(g, { from: "p:x", to: "c:b", type: "WORKS_AT" as const, weight: 0.5, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    expect(findEdgesTo(g, "c:b")).toHaveLength(2);
  });

  it("filters by type", async () => {
    const { readGraph, upsertEdge, findEdgesTo } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertEdge(g, { from: "p:a", to: "c:b", type: "WORKS_AT" as const, weight: 0.5, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    g = upsertEdge(g, { from: "p:a", to: "c:b", type: "IS_CHAMPION" as const, weight: 0.8, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    expect(findEdgesTo(g, "c:b", "IS_CHAMPION")).toHaveLength(1);
  });
});

// ─── getStakeholders ──────────────────────────────────────────────────────────

describe("getStakeholders", () => {
  it("returns empty lists when graph is empty", async () => {
    const { readGraph, getStakeholders } = await import("../../src/core/graph.js");
    const g = readGraph(DATA_DIR, SLUG);
    const s = getStakeholders(g);
    expect(s.champions).toEqual([]);
    expect(s.blockers).toEqual([]);
    expect(s.economicBuyers).toEqual([]);
    expect(s.allContacts).toEqual([]);
    expect(s.missingRoles).toEqual([]);
  });

  it("returns champions from IS_CHAMPION edges", async () => {
    const { readGraph, upsertNode, upsertEdge, getStakeholders } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertNode(g, { id: "person:a@b.com", type: "person", label: "Alice", properties: {} });
    g = upsertEdge(g, { from: "person:a@b.com", to: "deal:d1", type: "IS_CHAMPION" as const, weight: 0.8, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    const s = getStakeholders(g);
    expect(s.champions).toHaveLength(1);
    expect(s.champions[0]!.id).toBe("person:a@b.com");
  });

  it("returns blockers from IS_BLOCKER edges", async () => {
    const { readGraph, upsertNode, upsertEdge, getStakeholders } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertNode(g, { id: "person:b@b.com", type: "person", label: "Bob", properties: {} });
    g = upsertEdge(g, { from: "person:b@b.com", to: "deal:d1", type: "IS_BLOCKER" as const, weight: 0.8, sentiment: -0.5, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    const s = getStakeholders(g);
    expect(s.blockers).toHaveLength(1);
  });

  it("returns economicBuyers from IS_ECONOMIC_BUYER edges", async () => {
    const { readGraph, upsertNode, upsertEdge, getStakeholders } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertNode(g, { id: "person:c@b.com", type: "person", label: "Carol", properties: {} });
    g = upsertEdge(g, { from: "person:c@b.com", to: "deal:d1", type: "IS_ECONOMIC_BUYER" as const, weight: 0.9, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    const s = getStakeholders(g);
    expect(s.economicBuyers).toHaveLength(1);
  });

  it("missingRoles includes champion when no IS_CHAMPION and contacts > 0", async () => {
    const { readGraph, upsertNode, getStakeholders } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertNode(g, { id: "person:a@b.com", type: "person", label: "Alice", properties: {} });
    const s = getStakeholders(g);
    expect(s.missingRoles.some((r) => r.role === "champion")).toBe(true);
  });

  it("missingRoles includes economic_buyer when no IS_ECONOMIC_BUYER and contacts > 0", async () => {
    const { readGraph, upsertNode, getStakeholders } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertNode(g, { id: "person:a@b.com", type: "person", label: "Alice", properties: {} });
    const s = getStakeholders(g);
    expect(s.missingRoles.some((r) => r.role === "economic_buyer")).toBe(true);
  });

  it("missingRoles is empty when no contacts exist", async () => {
    const { readGraph, getStakeholders } = await import("../../src/core/graph.js");
    const g = readGraph(DATA_DIR, SLUG);
    const s = getStakeholders(g);
    expect(s.missingRoles).toHaveLength(0);
  });

  it("missingRoles is empty when both champion and economic_buyer are set", async () => {
    const { readGraph, upsertNode, upsertEdge, getStakeholders } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertNode(g, { id: "person:a@b.com", type: "person", label: "Alice", properties: {} });
    g = upsertNode(g, { id: "person:b@b.com", type: "person", label: "Bob", properties: {} });
    g = upsertEdge(g, { from: "person:a@b.com", to: "deal:d1", type: "IS_CHAMPION" as const, weight: 0.8, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    g = upsertEdge(g, { from: "person:b@b.com", to: "deal:d1", type: "IS_ECONOMIC_BUYER" as const, weight: 0.9, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    const s = getStakeholders(g);
    expect(s.missingRoles).toHaveLength(0);
  });
});

// ─── setNodeRole ─────────────────────────────────────────────────────────────

describe("setNodeRole", () => {
  it("creates IS_CHAMPION edge from nodeId to targetId", async () => {
    const { readGraph, setNodeRole, findEdges } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = setNodeRole(g, "person:a@b.com", "deal:d1", "champion");
    const edges = findEdges(g, "person:a@b.com", "IS_CHAMPION");
    expect(edges).toHaveLength(1);
    expect(edges[0]!.to).toBe("deal:d1");
  });

  it("creates IS_BLOCKER edge for blocker role", async () => {
    const { readGraph, setNodeRole, findEdges } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = setNodeRole(g, "person:a@b.com", "deal:d1", "blocker");
    expect(findEdges(g, "person:a@b.com", "IS_BLOCKER")).toHaveLength(1);
  });

  it("creates IS_ECONOMIC_BUYER edge for economic_buyer role", async () => {
    const { readGraph, setNodeRole, findEdges } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = setNodeRole(g, "person:a@b.com", "deal:d1", "economic_buyer");
    expect(findEdges(g, "person:a@b.com", "IS_ECONOMIC_BUYER")).toHaveLength(1);
  });

  it("does nothing for user role", async () => {
    const { readGraph, setNodeRole } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = setNodeRole(g, "person:a@b.com", "deal:d1", "user");
    expect(g.edges).toHaveLength(0);
  });
});

// ─── getStakeholders dedup ────────────────────────────────────────────────────

describe("getStakeholders — deduplication", () => {
  it("does not duplicate champion node when person IS_CHAMPION on multiple deals", async () => {
    const { readGraph, upsertNode, upsertEdge, getStakeholders } = await import("../../src/core/graph.js");
    let g = readGraph(DATA_DIR, SLUG);
    g = upsertNode(g, { id: "person:a@b.com", type: "person", label: "Alice", properties: {} });
    g = upsertEdge(g, { from: "person:a@b.com", to: "deal:d1", type: "IS_CHAMPION" as const, weight: 0.8, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    g = upsertEdge(g, { from: "person:a@b.com", to: "deal:d2", type: "IS_CHAMPION" as const, weight: 0.8, sentiment: 0, lastContact: "2026-05-27", contactCount: 1, properties: {} });
    const s = getStakeholders(g);
    expect(s.champions).toHaveLength(1);
    expect(s.champions[0]!.id).toBe("person:a@b.com");
  });
});

// ─── makeEdgeId ───────────────────────────────────────────────────────────────

describe("makeEdgeId", () => {
  it("produces deterministic id", async () => {
    const { makeEdgeId } = await import("../../src/core/graph.js");
    const id = makeEdgeId("KNOWS", "person:a@b.com", "person:c@d.com");
    expect(id).toBe("KNOWS:person:a@b.com__person:c@d.com");
  });

  it("same inputs always produce same id", async () => {
    const { makeEdgeId } = await import("../../src/core/graph.js");
    expect(makeEdgeId("WORKS_AT", "p:a", "c:b")).toBe(makeEdgeId("WORKS_AT", "p:a", "c:b"));
  });
});

// ─── pruneStaleNodes ──────────────────────────────────────────────────────────

describe("pruneStaleNodes", () => {
  it("marks nodes older than maxAgeDays as inactive", async () => {
    const { pruneStaleNodes } = await import("../../src/core/graph.js");
    const staleNode = {
      id: "person:old@acme.com",
      type: "person" as const,
      label: "Old Contact",
      properties: {},
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const graph = {
      schemaVersion: "1" as const,
      slug: "acme-corp",
      nodes: [staleNode],
      edges: [],
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const result = pruneStaleNodes(graph, 365, "2026-05-28");
    expect(result.nodes[0]!.status).toBe("inactive");
  });

  it("leaves recent nodes unchanged (no status added)", async () => {
    const { pruneStaleNodes } = await import("../../src/core/graph.js");
    const freshNode = {
      id: "person:new@acme.com",
      type: "person" as const,
      label: "Fresh Contact",
      properties: {},
      createdAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-01T00:00:00Z",
    };
    const graph = {
      schemaVersion: "1" as const,
      slug: "acme-corp",
      nodes: [freshNode],
      edges: [],
      updatedAt: "2026-05-01T00:00:00Z",
    };
    const result = pruneStaleNodes(graph, 365, "2026-05-28");
    expect(result.nodes[0]!.status).toBeUndefined();
  });

  it("does not re-mark already-inactive nodes", async () => {
    const { pruneStaleNodes } = await import("../../src/core/graph.js");
    const inactiveNode = {
      id: "person:old@acme.com",
      type: "person" as const,
      label: "Old",
      properties: {},
      status: "inactive" as const,
      createdAt: "2020-01-01T00:00:00Z",
      updatedAt: "2020-01-01T00:00:00Z",
    };
    const graph = {
      schemaVersion: "1" as const,
      slug: "acme-corp",
      nodes: [inactiveNode],
      edges: [],
      updatedAt: "2020-01-01T00:00:00Z",
    };
    const result = pruneStaleNodes(graph, 365, "2026-05-28");
    expect(result.nodes[0]!.status).toBe("inactive");
  });

  it("does not mutate the original graph", async () => {
    const { pruneStaleNodes } = await import("../../src/core/graph.js");
    const staleNode = {
      id: "person:old@acme.com",
      type: "person" as const,
      label: "Old",
      properties: {},
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const graph = {
      schemaVersion: "1" as const,
      slug: "acme-corp",
      nodes: [staleNode],
      edges: [],
      updatedAt: "2024-01-01T00:00:00Z",
    };
    pruneStaleNodes(graph, 365, "2026-05-28");
    expect((graph.nodes[0] as { status?: string }).status).toBeUndefined();
  });

  it("marks nodes inactive with default 365-day threshold", async () => {
    const { pruneStaleNodes } = await import("../../src/core/graph.js");
    const node = {
      id: "person:a@b.com",
      type: "person" as const,
      label: "A",
      properties: {},
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const graph = {
      schemaVersion: "1" as const,
      slug: "s",
      nodes: [node],
      edges: [],
      updatedAt: "2024-01-01T00:00:00Z",
    };
    // ~880 days ago from 2026-05-28 → stale at default 365 days
    const result = pruneStaleNodes(graph, undefined, "2026-05-28");
    expect(result.nodes[0]!.status).toBe("inactive");
  });
});

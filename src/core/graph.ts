import fs from "fs";
import path from "path";
import { withJsonFile } from "./file-lock.js";

export type NodeType = "person" | "company" | "deal" | "product" | "event";

export type EdgeType =
  | "KNOWS"
  | "WORKS_AT"
  | "IS_CHAMPION"
  | "IS_BLOCKER"
  | "IS_ECONOMIC_BUYER"
  | "INTRODUCED_BY"
  | "OWNS_DEAL"
  | "COMPETES_WITH";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  status?: "active" | "inactive";
  properties: {
    email?: string;
    title?: string;
    company?: string;
    domain?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  weight: number;
  sentiment: number;
  lastContact: string;
  contactCount: number;
  properties: Record<string, unknown>;
}

export interface CustomerGraph {
  schemaVersion: "1";
  slug: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  updatedAt: string;
}

export type StakeholderRole = "champion" | "blocker" | "economic_buyer" | "user";

export interface MissingRole {
  role: "champion" | "economic_buyer";
  urgency: "critical" | "important";
  suggestion: string;
}

export interface StakeholderSummary {
  champions: GraphNode[];
  blockers: GraphNode[];
  economicBuyers: GraphNode[];
  allContacts: GraphNode[];
  missingRoles: MissingRole[];
}

// ─── File path ────────────────────────────────────────────────────────────────

export function graphPath(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug, "graph.json");
}

export function emptyGraph(slug: string): CustomerGraph {
  return {
    schemaVersion: "1",
    slug,
    nodes: [],
    edges: [],
    updatedAt: new Date().toISOString(),
  };
}

// ─── Read / Write ─────────────────────────────────────────────────────────────

export function readGraph(dataDir: string, slug: string): CustomerGraph {
  const p = graphPath(dataDir, slug);
  if (!fs.existsSync(p)) return emptyGraph(slug);
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as CustomerGraph;
  } catch {
    process.stderr.write(`[graph] failed to parse ${p} — returning empty graph\n`);
    return emptyGraph(slug);
  }
}

export async function writeGraph(
  dataDir: string,
  slug: string,
  updater: (current: CustomerGraph | null) => CustomerGraph
): Promise<CustomerGraph> {
  return withJsonFile<CustomerGraph>(graphPath(dataDir, slug), (current) => {
    const g = updater(current);
    return { ...g, updatedAt: new Date().toISOString() };
  });
}

// ─── Node operations ──────────────────────────────────────────────────────────

export function upsertNode(
  graph: CustomerGraph,
  node: Omit<GraphNode, "createdAt" | "updatedAt">
): CustomerGraph {
  const now = new Date().toISOString();
  const idx = graph.nodes.findIndex((n) => n.id === node.id);
  if (idx !== -1) {
    const existing = graph.nodes[idx]!;
    const updated: GraphNode = {
      ...existing,
      label: node.label || existing.label,
      properties: { ...existing.properties, ...node.properties },
      updatedAt: now,
    };
    const nodes = [...graph.nodes];
    nodes[idx] = updated;
    return { ...graph, nodes };
  }
  const newNode: GraphNode = { ...node, createdAt: now, updatedAt: now };
  return { ...graph, nodes: [...graph.nodes, newNode] };
}

export function findNode(graph: CustomerGraph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export function findNodesByType(graph: CustomerGraph, type: NodeType): GraphNode[] {
  return graph.nodes.filter((n) => n.type === type);
}

// ─── Edge operations ──────────────────────────────────────────────────────────

export function makeEdgeId(type: EdgeType, fromId: string, toId: string): string {
  return `${type}:${fromId}__${toId}`;
}

export function upsertEdge(
  graph: CustomerGraph,
  edge: Omit<GraphEdge, "id"> & { id?: string }
): CustomerGraph {
  const id = edge.id ?? makeEdgeId(edge.type, edge.from, edge.to);
  const idx = graph.edges.findIndex((e) => e.id === id);
  if (idx !== -1) {
    const existing = graph.edges[idx]!;
    const updated: GraphEdge = {
      ...existing,
      weight: Math.min(1.0, existing.weight + 0.05),
      contactCount: existing.contactCount + 1,
      lastContact: edge.lastContact,
      properties: { ...existing.properties, ...edge.properties },
    };
    const edges = [...graph.edges];
    edges[idx] = updated;
    return { ...graph, edges };
  }
  const newEdge: GraphEdge = { ...edge, id };
  return { ...graph, edges: [...graph.edges, newEdge] };
}

export function findEdges(
  graph: CustomerGraph,
  fromId: string,
  type?: EdgeType
): GraphEdge[] {
  return graph.edges.filter(
    (e) => e.from === fromId && (type === undefined || e.type === type)
  );
}

export function findEdgesTo(
  graph: CustomerGraph,
  toId: string,
  type?: EdgeType
): GraphEdge[] {
  return graph.edges.filter(
    (e) => e.to === toId && (type === undefined || e.type === type)
  );
}

// ─── Role assignment ──────────────────────────────────────────────────────────

const ROLE_EDGE_MAP: Record<Exclude<StakeholderRole, "user">, EdgeType> = {
  champion: "IS_CHAMPION",
  blocker: "IS_BLOCKER",
  economic_buyer: "IS_ECONOMIC_BUYER",
};

export function setNodeRole(
  graph: CustomerGraph,
  nodeId: string,
  targetId: string,
  role: StakeholderRole
): CustomerGraph {
  if (role === "user") return graph;
  const edgeType = ROLE_EDGE_MAP[role];
  const today = new Date().toISOString().slice(0, 10);
  return upsertEdge(graph, {
    from: nodeId,
    to: targetId,
    type: edgeType,
    weight: 0.8,
    sentiment: 0,
    lastContact: today,
    contactCount: 1,
    properties: {},
  });
}

// ─── Stakeholder query ────────────────────────────────────────────────────────

export function getStakeholders(graph: CustomerGraph): StakeholderSummary {
  const dedup = (nodes: GraphNode[]): GraphNode[] => {
    const seen = new Set<string>();
    return nodes.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
  };

  const resolve = (edges: GraphEdge[]): GraphNode[] =>
    dedup(
      edges.map((e) => findNode(graph, e.from)).filter((n): n is GraphNode => n !== undefined)
    );

  const champions = resolve(graph.edges.filter((e) => e.type === "IS_CHAMPION"));
  const blockers = resolve(graph.edges.filter((e) => e.type === "IS_BLOCKER"));
  const economicBuyers = resolve(graph.edges.filter((e) => e.type === "IS_ECONOMIC_BUYER"));
  const allContacts = findNodesByType(graph, "person");

  const missingRoles: MissingRole[] = [];
  if (allContacts.length > 0) {
    if (champions.length === 0) {
      missingRoles.push({
        role: "champion",
        urgency: "important",
        suggestion: "Identify who is driving this deal internally.",
      });
    }
    if (economicBuyers.length === 0) {
      missingRoles.push({
        role: "economic_buyer",
        urgency: "critical",
        suggestion: "Find out who signs the contract. Ask your champion directly.",
      });
    }
  }

  return { champions, blockers, economicBuyers, allContacts, missingRoles };
}

// ─── Pruning ──────────────────────────────────────────────────────────────────

export function pruneStaleNodes(
  graph: CustomerGraph,
  maxAgeDays = 365,
  today?: string
): CustomerGraph {
  const todayMs = today ? new Date(`${today}T00:00:00Z`).getTime() : Date.now();
  const threshold = maxAgeDays * 86_400_000;
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const age = todayMs - new Date(node.updatedAt).getTime();
      if (age > threshold && node.status !== "inactive") {
        return { ...node, status: "inactive" as const };
      }
      return node;
    }),
  };
}

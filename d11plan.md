# D11 — Knowledge Graph Layer: Implementierungsplan

> Basis: plan-next-dxc.md · D11 · Stand: 2026-05-27
> TDD-First. Kein Produktionscode ohne vorherigen Test.

---

## Was D11 liefert

`customers/acme-corp/graph.json` — eine persistente Adjacency-List die automatisch wächst, wenn Interaktionen geloggt werden. Kontakte werden als Knoten modelliert, Beziehungen als gewichtete Kanten. Kein externes DB, kein Neo4j, kein Setup.

**User-sichtbare Änderungen:**
- Nach jedem `log_interaction` wird `graph.json` still aktualisiert (kein Breaking Change)
- Neues MCP-Tool `get_relationship_graph` gibt Stakeholder-Map zurück
- `dxcrm gdpr erase` löscht auch `graph.json`

---

## Neue Dateien

```
src/core/graph.ts                          ← Core: Datenmodell + read/write/query
src/core/graph-extractor.ts               ← Persons + Companies aus Interaction-Text extrahieren
src/mcp/tools/get-relationship-graph.ts   ← MCP-Tool Registration + Handler

__tests__/core/graph.test.ts
__tests__/core/graph-extractor.test.ts
__tests__/mcp/tools/get-relationship-graph.test.ts
```

## Geänderte Dateien

```
src/mcp/tools/log-interaction.ts   ← graph updaten nach appendInteraction (fire-and-forget)
src/mcp/server.ts                  ← registerGetRelationshipGraph() hinzufügen
src/commands/gdpr.ts               ← graph.json bei Erasure löschen
src/mcp/capabilities.ts            ← get_relationship_graph in CAPABILITIES_TEXT
```

---

## Datenmodell (exakt, TypeScript-ready)

### `src/core/graph.ts`

```typescript
export type NodeType = "person" | "company" | "deal" | "product" | "event";

export type EdgeType =
  | "KNOWS"              // Person hat Kontakt zu anderem Person-Knoten
  | "WORKS_AT"           // Person arbeitet bei Company
  | "IS_CHAMPION"        // Person treibt Deal aktiv voran
  | "IS_BLOCKER"         // Person blockiert Deal
  | "IS_ECONOMIC_BUYER"  // Person hat Budget-Entscheidung
  | "INTRODUCED_BY"      // Person wurde durch andere Person eingeführt
  | "OWNS_DEAL"          // Person ist primär verantwortlich für Deal
  | "COMPETES_WITH";     // Company konkurriert mit anderer Company

export interface GraphNode {
  id: string;        // kanonisch: "person:<email>" oder "person:<slug>:<name-slug>"
  type: NodeType;
  label: string;     // Anzeigename ("Max Müller")
  properties: {
    email?: string;
    title?: string;
    company?: string;
    domain?: string;
    [key: string]: unknown;
  };
  createdAt: string; // ISO-8601
  updatedAt: string;
}

export interface GraphEdge {
  id: string;         // "<type>:<fromId>__<toId>" — deterministisch, kein UUID
  from: string;
  to: string;
  type: EdgeType;
  weight: number;     // 0.0–1.0 — steigt mit jeder Interaktion (max 1.0)
  sentiment: number;  // -1.0 bis +1.0 — v1: immer 0.0 (neutral), D12 setzt echten Wert
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
```

### ID-Konvention (deterministisch, keine UUIDs)

```
Person mit bekannter Email:   "person:max.mueller@acme.com"
Person ohne Email:            "person:acme-corp:max-mueller"   ← slug + name-slug
Company:                      "company:acme.com"               ← domain bevorzugt
Company ohne Domain:          "company:acme-corp:acme-corp"
Edge:                         "KNOWS:person:a@b.com__person:c@d.com"
```

Vorteil: Idempotentes Upsert ohne Lookup → bei erneutem Auftreten der gleichen Person wird der existierende Knoten gefunden, nicht ein zweiter erstellt.

---

## Datei 1: `src/core/graph.ts` — vollständige API

### Dateipfad

```typescript
export function graphPath(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug, "graph.json");
}
```

### Lesen / Schreiben

```typescript
export function readGraph(dataDir: string, slug: string): CustomerGraph {
  const p = graphPath(dataDir, slug);
  if (!fs.existsSync(p)) {
    return emptyGraph(slug);
  }
  return JSON.parse(fs.readFileSync(p, "utf-8")) as CustomerGraph;
}

export function writeGraph(dataDir: string, slug: string, graph: CustomerGraph): void {
  graph.updatedAt = new Date().toISOString();
  fs.writeFileSync(graphPath(dataDir, slug), JSON.stringify(graph, null, 2), "utf-8");
}

function emptyGraph(slug: string): CustomerGraph {
  return { schemaVersion: "1", slug, nodes: [], edges: [], updatedAt: new Date().toISOString() };
}
```

### Knoten-Operationen

```typescript
// Gibt geänderte Kopie zurück — Graph ist immutable in-memory
export function upsertNode(
  graph: CustomerGraph,
  node: Omit<GraphNode, "createdAt" | "updatedAt">
): CustomerGraph {
  const now = new Date().toISOString();
  const existing = graph.nodes.find((n) => n.id === node.id);
  if (existing) {
    // Merge properties, update label + updatedAt
    const updated: GraphNode = {
      ...existing,
      label: node.label || existing.label,
      properties: { ...existing.properties, ...node.properties },
      updatedAt: now,
    };
    return { ...graph, nodes: graph.nodes.map((n) => (n.id === node.id ? updated : n)) };
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
```

### Kanten-Operationen

```typescript
export function makeEdgeId(type: EdgeType, fromId: string, toId: string): string {
  return `${type}:${fromId}__${toId}`;
}

export function upsertEdge(
  graph: CustomerGraph,
  edge: Omit<GraphEdge, "id">
): CustomerGraph {
  const id = makeEdgeId(edge.type, edge.from, edge.to);
  const existing = graph.edges.find((e) => e.id === id);
  if (existing) {
    const updated: GraphEdge = {
      ...existing,
      weight: Math.min(1.0, existing.weight + 0.05),  // +5% pro Interaktion, max 1.0
      contactCount: existing.contactCount + 1,
      lastContact: edge.lastContact,
      // sentiment: bleibt bei D12, hier unverändert
      properties: { ...existing.properties, ...edge.properties },
    };
    return { ...graph, edges: graph.edges.map((e) => (e.id === id ? updated : e)) };
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
```

### Rollen-Zuweisung

```typescript
// Setzt Kante vom Typ IS_CHAMPION / IS_BLOCKER / IS_ECONOMIC_BUYER
// auf Knoten-ID. Entfernt ggf. vorherige Kante desselben Typs für andere Knoten.
export type StakeholderRole = "champion" | "blocker" | "economic_buyer" | "user";

const ROLE_EDGE_MAP: Record<StakeholderRole, EdgeType> = {
  champion: "IS_CHAMPION",
  blocker: "IS_BLOCKER",
  economic_buyer: "IS_ECONOMIC_BUYER",
  user: "KNOWS",  // "user" = kein eigener Edge-Typ, bleibt als KNOWS
};

export function setNodeRole(
  graph: CustomerGraph,
  nodeId: string,
  dealId: string,
  role: StakeholderRole
): CustomerGraph {
  if (role === "user") return graph;
  const edgeType = ROLE_EDGE_MAP[role];
  const today = new Date().toISOString().slice(0, 10);
  return upsertEdge(graph, {
    from: nodeId,
    to: dealId,
    type: edgeType,
    weight: 0.8,
    sentiment: 0,
    lastContact: today,
    contactCount: 1,
    properties: {},
  });
}
```

### Stakeholder-Abfrage

```typescript
export interface StakeholderSummary {
  champions: GraphNode[];
  blockers: GraphNode[];
  economicBuyers: GraphNode[];
  allContacts: GraphNode[];         // alle person-Knoten
  missingRoles: MissingRole[];
}

export interface MissingRole {
  role: "champion" | "economic_buyer";
  urgency: "critical" | "important";
  suggestion: string;
}

export function getStakeholders(graph: CustomerGraph): StakeholderSummary {
  const champions = graph.edges
    .filter((e) => e.type === "IS_CHAMPION")
    .map((e) => findNode(graph, e.from))
    .filter((n): n is GraphNode => n !== undefined);

  const blockers = graph.edges
    .filter((e) => e.type === "IS_BLOCKER")
    .map((e) => findNode(graph, e.from))
    .filter((n): n is GraphNode => n !== undefined);

  const economicBuyers = graph.edges
    .filter((e) => e.type === "IS_ECONOMIC_BUYER")
    .map((e) => findNode(graph, e.from))
    .filter((n): n is GraphNode => n !== undefined);

  const allContacts = findNodesByType(graph, "person");

  const missingRoles: MissingRole[] = [];
  if (champions.length === 0 && allContacts.length > 0) {
    missingRoles.push({
      role: "champion",
      urgency: "important",
      suggestion: "Identify who is driving this deal internally.",
    });
  }
  if (economicBuyers.length === 0 && allContacts.length > 0) {
    missingRoles.push({
      role: "economic_buyer",
      urgency: "critical",
      suggestion: "Find out who signs the contract. Ask your champion directly.",
    });
  }

  return { champions, blockers, economicBuyers, allContacts, missingRoles };
}
```

---

## Datei 2: `src/core/graph-extractor.ts`

Extrahiert Person-Knoten und Company-Knoten aus Interaction-Rohdaten. Kein LLM — reines Parsing.

```typescript
import type { GraphNode, GraphEdge, EdgeType } from "./graph.js";

export interface ExtractionInput {
  slug: string;
  withStr: string;        // "Max Müller", "max@acme.com", "Max Müller <max@acme.com>"
  interactionDate: string;
  domain?: string;        // aus main_facts.md (für Company-Knoten)
  companyName?: string;   // aus main_facts.md
}

// "Max Müller <max.mueller@acme.com>" → "max.mueller@acme.com"
// "max.mueller@acme.com" → "max.mueller@acme.com"
// "Max Müller" → undefined
export function extractEmail(withStr: string): string | undefined {
  const match = withStr.match(/<([^>]+@[^>]+)>/) ?? withStr.match(/^([^\s]+@[^\s]+)$/);
  return match?.[1];
}

// "Max Müller <max@acme.com>" → "Max Müller"
// "max@acme.com" → "max@acme.com" (email selbst als Label)
export function extractDisplayName(withStr: string): string {
  const match = withStr.match(/^(.+?)\s*<[^>]+>$/);
  if (match?.[1]) return match[1].trim();
  return withStr.trim();
}

// Deterministischer Person-ID
// Mit Email: "person:max@acme.com"
// Ohne Email: "person:<slug>:<name-slug>"
export function makePersonId(withStr: string, slug: string): string {
  const email = extractEmail(withStr);
  if (email) return `person:${email.toLowerCase()}`;
  const name = extractDisplayName(withStr);
  const nameSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `person:${slug}:${nameSlug}`;
}

export function makeCompanyId(domain?: string, slug?: string, companyName?: string): string {
  if (domain) return `company:${domain.toLowerCase()}`;
  if (slug) return `company:${slug}`;
  if (companyName) {
    const s = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `company:${s}`;
  }
  return `company:unknown`;
}

// Gibt person-Knoten + optional company-Knoten zurück
export function extractNodes(input: ExtractionInput): GraphNode[] {
  const now = new Date().toISOString();
  const email = extractEmail(input.withStr);
  const label = extractDisplayName(input.withStr);
  const personId = makePersonId(input.withStr, input.slug);

  const personNode: GraphNode = {
    id: personId,
    type: "person",
    label,
    properties: {
      ...(email !== undefined ? { email } : {}),
      ...(input.companyName !== undefined ? { company: input.companyName } : {}),
      ...(input.domain !== undefined ? { domain: input.domain } : {}),
    },
    createdAt: now,
    updatedAt: now,
  };

  const nodes: GraphNode[] = [personNode];

  // Company-Knoten, wenn domain oder companyName bekannt
  if (input.domain ?? input.companyName) {
    const companyId = makeCompanyId(input.domain, input.slug, input.companyName);
    const companyNode: GraphNode = {
      id: companyId,
      type: "company",
      label: input.companyName ?? input.domain ?? input.slug,
      properties: {
        ...(input.domain !== undefined ? { domain: input.domain } : {}),
      },
      createdAt: now,
      updatedAt: now,
    };
    nodes.push(companyNode);
  }

  return nodes;
}

// KNOWS-Kante (ungerichtet — from=person, to=companyNode)
// + WORKS_AT wenn company-Knoten vorhanden
export function extractEdges(
  personId: string,
  companyId: string | undefined,
  interactionDate: string
): GraphEdge[] {
  if (!companyId) return [];
  const edgeId = `WORKS_AT:${personId}__${companyId}`;
  return [
    {
      id: edgeId,
      from: personId,
      to: companyId,
      type: "WORKS_AT" as EdgeType,
      weight: 0.5,
      sentiment: 0,
      lastContact: interactionDate,
      contactCount: 1,
      properties: {},
    },
  ];
}
```

---

## Datei 3: `src/mcp/tools/get-relationship-graph.ts`

```typescript
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readGraph, getStakeholders } from "../../core/graph.js";

const DATA_DIR = process.cwd();

export async function handleGetRelationshipGraph(
  input: { slug: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const graph = readGraph(dataDir, input.slug);
    const stakeholders = getStakeholders(graph);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              slug: input.slug,
              nodeCount: graph.nodes.length,
              edgeCount: graph.edges.length,
              updatedAt: graph.updatedAt,
              stakeholders: {
                champions: stakeholders.champions.map(summarizeNode),
                blockers: stakeholders.blockers.map(summarizeNode),
                economicBuyers: stakeholders.economicBuyers.map(summarizeNode),
                allContacts: stakeholders.allContacts.map(summarizeNode),
                missingRoles: stakeholders.missingRoles,
              },
              nodes: graph.nodes,
              edges: graph.edges,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2),
        },
      ],
    };
  }
}

function summarizeNode(n: { id: string; label: string; properties: Record<string, unknown> }) {
  return { id: n.id, name: n.label, email: n.properties["email"] };
}

export function registerGetRelationshipGraph(server: McpServer): void {
  server.registerTool(
    "get_relationship_graph",
    {
      title: "Get Relationship Graph",
      description: `Returns the knowledge graph for a customer: all known contacts, companies,
and the relationships between them (KNOWS, WORKS_AT, IS_CHAMPION, IS_BLOCKER, IS_ECONOMIC_BUYER).

The graph auto-populates from every log_interaction call.
Use this before a complex deal conversation to understand the stakeholder map.

Args:
  slug: Customer slug

Returns: {
  stakeholders: { champions[], blockers[], economicBuyers[], allContacts[], missingRoles[] },
  nodes: GraphNode[],
  edges: GraphEdge[]
}`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug (e.g. 'acme-corp')"),
      }),
    },
    async ({ slug }) => handleGetRelationshipGraph({ slug })
  );
}
```

---

## Integration: `src/mcp/tools/log-interaction.ts`

**Einfügestelle:** nach dem `await appendInteraction(...)` Block, vor dem Audit-Eintrag. Fire-and-forget via `.catch` — Graph-Fehler dürfen nie die Interaction blockieren.

```typescript
// NEU — nach Zeile 47 (nach appendInteraction)
// Graph auto-update: fire-and-forget
updateGraphFromInteraction(dataDir, input.slug, {
  withStr: input.with,
  interactionDate: today,
}).catch(() => {
  // non-critical — interaction already written
});
```

**Neue Hilfsfunktion** (in derselben Datei oder in graph-extractor.ts als Export):

```typescript
// Importieren in log-interaction.ts:
import { updateGraphFromInteraction } from "../../core/graph-extractor.js";
```

**Implementierung in `graph-extractor.ts`:**

```typescript
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { readGraph, writeGraph, upsertNode, upsertEdge } from "./graph.js";
import { extractNodes, extractEdges, makePersonId, makeCompanyId } from "./graph-extractor.js";

export async function updateGraphFromInteraction(
  dataDir: string,
  slug: string,
  input: { withStr: string; interactionDate: string }
): Promise<void> {
  // Lade Domain + Company aus main_facts.md (non-critical wenn nicht vorhanden)
  let domain: string | undefined;
  let companyName: string | undefined;
  const factsPath = path.join(dataDir, "customers", slug, "main_facts.md");
  if (fs.existsSync(factsPath)) {
    try {
      const parsed = matter(fs.readFileSync(factsPath, "utf-8"));
      domain = parsed.data.domain as string | undefined;
      companyName = parsed.data.name as string | undefined;
    } catch {
      // ignore
    }
  }

  const nodes = extractNodes({
    slug,
    withStr: input.withStr,
    interactionDate: input.interactionDate,
    domain,
    companyName,
  });

  const personId = makePersonId(input.withStr, slug);
  const companyId =
    domain !== undefined || companyName !== undefined
      ? makeCompanyId(domain, slug, companyName)
      : undefined;
  const edges = extractEdges(personId, companyId, input.interactionDate);

  let graph = readGraph(dataDir, slug);
  for (const node of nodes) {
    graph = upsertNode(graph, node);
  }
  for (const edge of edges) {
    // upsertEdge erwartet Omit<GraphEdge, "id"> — id wird intern generiert
    // Aber wir haben bereits id gesetzt → wir rufen direkt die interne Upsert-Logik
    graph = upsertEdgeById(graph, edge);
  }
  writeGraph(dataDir, slug, graph);
}
```

**Hinweis:** `upsertEdgeById` akzeptiert eine vollständige `GraphEdge` — wenn Edge-ID schon existiert, wird Gewicht erhöht. Das muss als Export in `graph.ts` verfügbar gemacht werden (oder die `upsertEdge`-Funktion prüft ob `id` in `edge` vorhanden ist).

**Sauberste Lösung:** `upsertEdge` akzeptiert `GraphEdge` (mit optionaler ID):

```typescript
// in graph.ts — finale Signatur
export function upsertEdge(
  graph: CustomerGraph,
  edge: Omit<GraphEdge, "id"> & { id?: string }
): CustomerGraph {
  const id = edge.id ?? makeEdgeId(edge.type, edge.from, edge.to);
  // ... rest wie oben
}
```

---

## Integration: `src/mcp/server.ts`

```typescript
// Import hinzufügen (alphabetisch einfügen):
import { registerGetRelationshipGraph } from "./tools/get-relationship-graph.js";

// In createServer() / initServer() nach den bestehenden registerXxx-Calls:
registerGetRelationshipGraph(server);
```

---

## Integration: `src/commands/gdpr.ts`

```typescript
// Nach dem rmSync des customer-Verzeichnisses:
// graph.json ist im customer-Verzeichnis — wird durch rmSync bereits gelöscht.
// Kein gesonderter Schritt nötig. ✓
// (graph.json liegt unter customers/<slug>/graph.json — Teil des rekursiven rmSync)
```

Kein Code-Change nötig. Das Verzeichnis wird mit `fs.rmSync(customerDir, { recursive: true })` bereits vollständig gelöscht.

---

## Integration: `src/mcp/capabilities.ts`

`CAPABILITIES_TEXT` bekommt einen neuen Eintrag unter den MCP-Tools:

```
- get_relationship_graph(slug) — Relationship graph: all contacts, stakeholder roles (champion/blocker/economic buyer), auto-populated from interactions
```

---

## TDD — Test-Spezifikationen

### `__tests__/core/graph.test.ts`

```
describe("graph — readGraph")
  ✓ returns empty graph when file does not exist
  ✓ returns parsed graph from file
  ✓ schemaVersion is "1" on empty graph

describe("graph — upsertNode")
  ✓ adds new node
  ✓ merges properties on existing node (same id)
  ✓ updates label on existing node
  ✓ does not duplicate node on repeated upsert
  ✓ updates updatedAt on merge

describe("graph — upsertEdge")
  ✓ adds new edge with correct id
  ✓ increments contactCount on existing edge
  ✓ increments weight by 0.05 on existing edge
  ✓ weight never exceeds 1.0
  ✓ updates lastContact on existing edge
  ✓ does not duplicate edge on repeated upsert

describe("graph — findEdges")
  ✓ returns edges by fromId
  ✓ filters by type
  ✓ returns empty array when no edges match

describe("graph — findEdgesTo")
  ✓ returns edges by toId
  ✓ filters by type

describe("graph — getStakeholders")
  ✓ returns empty lists when graph is empty
  ✓ returns champions from IS_CHAMPION edges
  ✓ returns blockers from IS_BLOCKER edges
  ✓ returns economicBuyers from IS_ECONOMIC_BUYER edges
  ✓ missingRoles includes "economic_buyer" when no IS_ECONOMIC_BUYER edge exists and contacts > 0
  ✓ missingRoles includes "champion" when no IS_CHAMPION edge exists and contacts > 0
  ✓ missingRoles is empty when no contacts exist
  ✓ missingRoles is empty when both champion and economic_buyer are set

describe("graph — writeGraph + readGraph roundtrip")
  ✓ written graph is readable (memfs)
  ✓ updatedAt is refreshed on write
```

### `__tests__/core/graph-extractor.test.ts`

```
describe("extractEmail")
  ✓ extracts from "Max Müller <max@acme.com>"
  ✓ extracts bare email "max@acme.com"
  ✓ returns undefined for plain name "Max Müller"
  ✓ lowercases the email

describe("extractDisplayName")
  ✓ extracts name from "Max Müller <max@acme.com>"
  ✓ returns full string for bare email "max@acme.com"
  ✓ returns trimmed name for plain "Max Müller"

describe("makePersonId")
  ✓ uses email when present: "person:max@acme.com"
  ✓ uses slug+nameSlug when no email: "person:acme-corp:max-muller"
  ✓ normalizes special chars in name (ü → u in slug — aber nur für ID, label bleibt)
  ✓ idempotent: same input → same id

describe("extractNodes")
  ✓ returns 1 node when no domain/companyName
  ✓ returns 2 nodes (person + company) when domain is provided
  ✓ returns 2 nodes when only companyName is provided
  ✓ person node has correct id, label, email property
  ✓ company node has type "company" and domain property

describe("updateGraphFromInteraction")
  ✓ creates graph.json when it does not exist
  ✓ adds person node from "with" field
  ✓ adds company node when main_facts.md has domain
  ✓ adds WORKS_AT edge between person and company
  ✓ increments contactCount on repeated call with same person
  ✓ does not throw when main_facts.md is missing (non-critical)
  ✓ does not throw when customers/<slug>/ does not exist (non-critical)
```

### `__tests__/mcp/tools/get-relationship-graph.test.ts`

```
describe("handleGetRelationshipGraph")
  ✓ returns empty graph result when graph.json does not exist
  ✓ returns nodeCount and edgeCount
  ✓ returns stakeholder map with champions/blockers/economicBuyers
  ✓ returns missingRoles when no champion is set
  ✓ returns all nodes and edges in response
  ✓ error case: invalid slug — returns success: false with error message
  ✓ summarizeNode maps id, name, email correctly

describe("registerGetRelationshipGraph — MCP registration")
  ✓ tool is registered with name "get_relationship_graph"
  ✓ inputSchema requires slug (string)
```

### Additions zu `__tests__/mcp/tools/log-interaction.test.ts` (bestehende Datei)

```
describe("log_interaction — graph side effect")
  ✓ graph.json is created after first log_interaction
  ✓ person node is added to graph
  ✓ repeated log_interaction increments contactCount on WORKS_AT edge
  ✓ graph update failure does not fail log_interaction (fire-and-forget)
```

---

## Implementierungsreihenfolge (TDD-konform)

```
Schritt 1: Tests schreiben (alle rot)
  → __tests__/core/graph.test.ts        (alle describe-Blöcke)
  → __tests__/core/graph-extractor.test.ts

Schritt 2: src/core/graph.ts implementieren
  → emptyGraph, readGraph, writeGraph
  → upsertNode, findNode, findNodesByType
  → makeEdgeId, upsertEdge, findEdges, findEdgesTo
  → setNodeRole, getStakeholders
  → npm test __tests__/core/graph.test.ts → grün

Schritt 3: src/core/graph-extractor.ts implementieren
  → extractEmail, extractDisplayName, makePersonId, makeCompanyId
  → extractNodes, extractEdges
  → updateGraphFromInteraction
  → npm test __tests__/core/graph-extractor.test.ts → grün

Schritt 4: MCP-Tool Tests schreiben
  → __tests__/mcp/tools/get-relationship-graph.test.ts

Schritt 5: src/mcp/tools/get-relationship-graph.ts implementieren
  → npm test __tests__/mcp/tools/get-relationship-graph.test.ts → grün

Schritt 6: log-interaction.ts integrieren
  → updateGraphFromInteraction-Import hinzufügen
  → fire-and-forget Call nach appendInteraction
  → __tests__/mcp/tools/log-interaction.test.ts graph-Tests hinzufügen → grün

Schritt 7: server.ts + capabilities.ts updaten
  → registerGetRelationshipGraph(server)
  → CAPABILITIES_TEXT Eintrag

Schritt 8: Commit-Checkliste
  □ npm test → alle Tests grün (bestehende 778 + neue ~60)
  □ npm run build → kein Build-Fehler
  □ npm run typecheck → kein TypeScript-Fehler
  □ README.md MCP-Tools-Tabelle: get_relationship_graph hinzufügen
  □ docs/mcp-tools.md: get_relationship_graph Sektion
  □ docs/index.html nav + Section
```

---

## Edge Cases und Entscheidungen

| Fall | Entscheidung |
|---|---|
| `with`-Feld ist ein Team: "Max, Sarah" | Nur den ersten Namen parsen. Multi-Person-Parsing in D12. |
| Gleicher Name, verschiedene Emails | Verschiedene IDs — kein automatisches Dedup. Manuelles Merging via `setNodeRole`. |
| Interaction ohne `domain` in main_facts | Nur Person-Knoten, kein Company-Knoten. Kein Fehler. |
| graph.json korrupt (invalid JSON) | `readGraph` fängt Error, gibt `emptyGraph` zurück, loggt auf stderr. |
| Gleichzeitige Writes (Team-Modus) | `writeGraph` nutzt bestehenden `withFileQueue`-Mechanismus aus `write-queue.ts`. |
| Knoten-ID-Kollision: "max@acme.com" und "MAX@ACME.COM" | `extractEmail` lowercased immer → gleiche ID → korrekt gemergt. |
| `with`-Feld leer | `extractDisplayName` gibt leeren String zurück → Knoten-ID "person:<slug>:" → wird trotzdem angelegt, aber Label ist leer. Validierung: `if (!input.withStr.trim()) return;` in `updateGraphFromInteraction`. |
| Kundeverzeichnis existiert nicht | `readGraph` gibt `emptyGraph`, `writeGraph` scheitert an nicht-existierendem Verzeichnis → in `updateGraphFromInteraction` wrapped in try/catch. |

---

## Nicht in D11 (gehört zu D12 / D13)

- Sentiment-Analyse der Interaction-Summary → D12 setzt `sentiment` auf Basis von LLM
- Stakeholder-Rollen aus Freitext extrahieren ("Max ist unser Champion") → D13 via `run_deal_agent`
- Relationship Health Score → D12
- Warm-Intro-Path-Berechnung (`findWarmIntroPath`) → D12 (braucht gewichtete BFS)
- Automatisches Erkennen von "Person hat Firma verlassen" → D18 (externe Signale)

---

## Akzeptanzkriterien

D11 ist **fertig** wenn:

1. `log_interaction({ slug: "acme-corp", type: "Call", summary: "...", with: "Max Müller <max@acme.com>" })` → `customers/acme-corp/graph.json` existiert mit 1 person-Knoten + 1 company-Knoten.
2. Zweiter `log_interaction` mit gleicher Person → `contactCount` auf WORKS_AT-Kante = 2, kein zweiter Knoten.
3. `get_relationship_graph({ slug: "acme-corp" })` → gibt `stakeholders.allContacts` mit 1 Eintrag zurück.
4. `get_relationship_graph` auf Kunde ohne graph.json → kein Fehler, leere Arrays.
5. `dxcrm gdpr erase acme-corp --confirm` → `graph.json` ist weg (Teil des Verzeichnisses).
6. `npm test` → alle Tests grün (≥ 838 = 778 + ~60 neue Tests).
7. `npm run typecheck` → 0 Fehler.

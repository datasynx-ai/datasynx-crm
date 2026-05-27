# D15 — Procedural Memory / Playbooks: Implementierungsplan

> Basis: plan-next-dxc.md · D15 · Stand: 2026-05-27
> TDD-First. Kein Produktionscode ohne vorherigen Test.
> Baut auf D11 (graph.ts), D12 (relationship-health.ts), D13 (deal-agent.ts), D14 (revenue-simulation.ts) auf.

---

## Was D15 liefert

Das **prozedurale Gedächtnis** des CRM — Schicht 4 des CoALA Memory Stacks.

Bisher weiß der Agent *was* passiert ist (episodisch via interactions.md) und *wer* die Stakeholder sind (semantisch via graph.json). D15 fügt hinzu: *was man in dieser Situation tun soll* — kondensiertes Erfahrungswissen als Playbooks.

Drei neue Konzepte:
- **Playbook**: Markdown-Datei mit YAML-Frontmatter (Trigger + Erfolgsrate) + handlungsanleitendem Inhalt
- **Trigger DSL**: `deal_stage_negotiation AND value > 50000 AND days_stalled > 7` — einfache AND-Verkettung ohne Parser-Komplexität
- **distill_playbook**: LLM extrahiert nach einem won/lost Deal strukturierte Erkenntnisse und schreibt neues/aktualisiertes Playbook

**User-sichtbare Änderungen:**
- 4 neue MCP-Tools: `get_playbook`, `create_playbook`, `list_playbooks`, `distill_playbook`
- `run_deal_agent` (D13) nutzt automatisch passende Playbooks im Plan
- Neue Datei: `customers/<slug>/playbooks/<name>.md`

**Was D15 NICHT tut (v1-Grenzen):**
- Kein OR/NOT in Trigger-Ausdrücken — reines AND in v1
- `days_stalled` = Proxy via `daysSinceContact` (stage-change-timestamp nicht getrackt)
- Keine automatische Erfolgsrate-Aktualisierung via Webhook — manuell via `distill_playbook`
- Kein Global-Playbook-Repository (cross-customer) — kommt in D16+
- Keine cron-gesteuerte Trigger-Prüfung — kommt in D20

---

## Neue Dateien

```
src/core/playbooks.ts                          ← Core: DSL-Parser, Matching, Distillation
src/mcp/tools/get-playbook.ts                  ← MCP-Tool: get_playbook
src/mcp/tools/create-playbook.ts               ← MCP-Tool: create_playbook
src/mcp/tools/list-playbooks.ts                ← MCP-Tool: list_playbooks
src/mcp/tools/distill-playbook.ts              ← MCP-Tool: distill_playbook

__tests__/core/playbooks.test.ts
__tests__/mcp/tools/get-playbook.test.ts
__tests__/mcp/tools/create-playbook.test.ts
__tests__/mcp/tools/list-playbooks.test.ts
__tests__/mcp/tools/distill-playbook.test.ts
```

## Geänderte Dateien

```
src/agents/deal-agent.ts    ← DealObservation + matchingPlaybooks optional; buildLlmPrompt + buildRuleBasedAnalysis nutzen Playbooks
src/mcp/server.ts           ← 4 neue registerXxx() (23 tools gesamt)
src/mcp/capabilities.ts     ← 4 neue Tools in CAPABILITIES_TEXT
README.md
docs/mcp-tools.md
docs/index.html
```

---

## Technische Recherche & Designentscheidungen

### Warum kein vollständiger DSL-Parser?

Ein vollständiger Expression-Parser (mit OR, NOT, Klammern) wäre ~200 Zeilen Code plus
eigener Test-Suite für die Parsing-Logik. D15 braucht ihn nicht: die realen Playbook-Trigger
in der Praxis sind ausschließlich konjunktive Bedingungen ("alle diese Faktoren müssen
zutreffen"). OR-Logik wird durch mehrere Playbooks mit je eigenen AND-Triggern abgebildet.

Design-Entscheidung: **Tokens durch ` AND ` splitten, jeden Token einzeln matchen**.
Kein Regex-AST, kein Operator-Precedence, keine Klammerung.

### Trigger-Token-Typen (vollständige Liste v1)

| Token-Format | Typ | Matches wenn... |
|---|---|---|
| `deal_stage_<stage>` | stage | `deal.stage === stage` |
| `value > <n>` | value_gt | `deal.value > n` |
| `value < <n>` | value_lt | `deal.value < n` |
| `days_stalled > <n>` | days_stalled_gt | `daysSinceContact > n` (\*) |
| `days_stalled < <n>` | days_stalled_lt | `daysSinceContact < n` |
| `health < <n>` | health_lt | `deal.healthScore < n` |
| `health > <n>` | health_gt | `deal.healthScore > n` |
| `no_champion` | no_champion | `!deal.championPresent` |
| `has_champion` | has_champion | `deal.championPresent` |

(\*) `daysSinceContact` ist der v1-Proxy für "Deal steht still". Stage-change-Timestamps
werden in v1 nicht getrackt — `daysSinceContact` korreliert stark damit und ist
bereits in `DealSnapshot` vorhanden.

### Match-Score

`score = matchedConditions.length / totalConditions`

Ein Playbook mit 3 Conditions, das alle 3 erfüllt → score = 1.0.
Ein Playbook mit 3 Conditions, das 2 erfüllt → score = 0.67.
**Nur Playbooks mit score = 1.0 zählen als "matched"** — alle Bedingungen müssen erfüllt sein.
Der score ist trotzdem nützlich für Partial-Match-Debugging.

### Integration mit D13 (deal-agent.ts)

Rückwärtskompatibel: `matchingPlaybooks?: PlaybookMatch[]` als **optionales** Feld in
`DealObservation`. Wenn vorhanden, werden matching Playbooks in `buildLlmPrompt` als
Kontext-Abschnitt eingefügt und in `buildRuleBasedAnalysis` als Plan-Items vorgeschlagen.

```typescript
// In DealObservation (optional, damit alle D13-Tests unverändert bleiben):
matchingPlaybooks?: PlaybookMatch[];
```

In `observeDeal`: Playbooks laden und matchen, Ergebnis in `DealObservation` setzen.
In `buildLlmPrompt`: wenn `obs.matchingPlaybooks?.length > 0`, Playbook-Abschnitt einfügen.
In `buildRuleBasedAnalysis`: wenn matching Playbooks vorhanden, als erste Plan-Items.

### distill_playbook — LLM-Prompt-Design

```
Context: All interactions for customer <slug> from the past 6 months.
Deal: <dealName>, Outcome: won/lost, Value: €<n>, Final Stage: <stage>

Task: Analyze this deal's journey and extract a reusable playbook.

Return JSON:
{
  "name": "<kebab-case-name>",
  "trigger": "<DSL string using allowed tokens>",
  "content": "<markdown body with ## Situation, ## Steps, ## Warnings, ## Templates sections>",
  "successRate": <0.0-1.0 based on outcome>,
  "reasoning": "<why these trigger conditions>"
}
```

LLM-Injection identisch zu D13: `llmFn: (prompt: string) => Promise<string> = callLlm`.
Fallback wenn `parseLlmDistillation()` fehlschlägt: `null` zurückgeben (kein Crash).

### Playbook-Dateiformat

```markdown
---
trigger: deal_stage_negotiation AND value > 50000 AND days_stalled > 7
successRate: 0.73
usedCount: 14
lastUpdated: 2026-05-20
---

# Enterprise Renewal Playbook

## Situation
[Beschreibung der Situation in 2–3 Sätzen]

## Bewährtes Vorgehen
1. Direktanruf beim Economic Buyer (nicht beim Champion)
2. Framing: "Was braucht ihr, damit das intern genehmigt wird?"
3. ...

## Warnsignale
- Kein Reply in 3 Werktagen → Eskalation
- Preisdiskussion > 2 Runden → Deal vermutlich nicht abschlussbereit

## Templates
### Eskalations-Mail
Subject: Nächste Schritte: [Deal-Name]
Body: ...
```

YAML-Pflichtfelder: `trigger`, `successRate`, `usedCount`, `lastUpdated`.
Body (alles nach dem `---`-Block) ist freies Markdown — kein Schema erzwungen.

### Playbook-Name

Filename ohne `.md`-Erweiterung ist der kanonische Name.
`customers/acme-corp/playbooks/enterprise-renewal.md` → name: `"enterprise-renewal"`.
`create_playbook` akzeptiert `name` als Input, normalisiert zu kebab-case.

### `list_playbooks` vs `get_playbook`

- `list_playbooks({ slug })` → alle Playbooks als Array (Frontmatter + Pfad, kein Body)
- `get_playbook({ slug, dealName?, stage?, value? })` → beste Matches mit Body, sortiert nach Score

`get_playbook` ohne Deal-Kontext → gibt alle Playbooks zurück (unscored).
`get_playbook` mit Deal-Kontext → gibt nur score=1.0 Matches zurück, sortiert nach Erfolgsrate.

---

## Datenmodell

### `src/core/playbooks.ts` — vollständige Typen

```typescript
import { DealSnapshot } from "./revenue-simulation.js";

export interface PlaybookFrontmatter {
  trigger: string;        // DSL string
  successRate: number;    // 0.0–1.0
  usedCount: number;
  lastUpdated: string;    // YYYY-MM-DD
}

export interface Playbook {
  slug: string;           // customer slug
  name: string;           // filename ohne .md
  frontmatter: PlaybookFrontmatter;
  content: string;        // Markdown body (ohne YAML-Block)
  path: string;           // absoluter Pfad
}

export interface TriggerCondition {
  type:
    | "stage"
    | "value_gt" | "value_lt"
    | "days_stalled_gt" | "days_stalled_lt"
    | "health_lt" | "health_gt"
    | "no_champion" | "has_champion";
  value?: number;         // für numerische Conditions
  stage?: string;         // nur für type="stage"
}

export interface PlaybookMatch {
  playbook: Playbook;
  score: number;          // matchedConditions / totalConditions
  matchedConditions: TriggerCondition[];
  totalConditions: number;
}

export interface LlmDistillation {
  name: string;
  trigger: string;
  content: string;
  successRate: number;
  reasoning: string;
}
```

### Dateistruktur

```
customers/acme-corp/
└── playbooks/
    ├── enterprise-renewal.md
    └── competitor-objection.md
```

### Beispiel-Output `get_playbook`

```json
{
  "matches": [
    {
      "name": "enterprise-renewal",
      "score": 1.0,
      "matchedConditions": ["deal_stage_negotiation", "value > 50000", "days_stalled > 7"],
      "successRate": 0.73,
      "usedCount": 14,
      "content": "# Enterprise Renewal Playbook\n\n## Situation\n...",
      "trigger": "deal_stage_negotiation AND value > 50000 AND days_stalled > 7"
    }
  ],
  "totalPlaybooks": 2,
  "slug": "acme-corp"
}
```

### Beispiel-Output `distill_playbook`

```json
{
  "success": true,
  "playbook": {
    "name": "negotiation-price-objection",
    "trigger": "deal_stage_negotiation AND health < 60",
    "successRate": 1.0,
    "usedCount": 1,
    "path": "/data/customers/acme-corp/playbooks/negotiation-price-objection.md"
  },
  "reasoning": "Deal was rescued by shifting discussion to ROI framing instead of price."
}
```

---

## Datei 1: `src/core/playbooks.ts` — vollständige API

### Imports

```typescript
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { callLlm } from "../llm/llm.js";
import type { DealSnapshot } from "./revenue-simulation.js";
```

### Datei-Operationen

```typescript
export function playbooksDir(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug, "playbooks");
}

export function listPlaybooks(dataDir: string, slug: string): Playbook[] {
  const dir = playbooksDir(dataDir, slug);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const filePath = path.join(dir, f);
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = matter(raw);
      return {
        slug,
        name: f.replace(/\.md$/, ""),
        frontmatter: parsed.data as PlaybookFrontmatter,
        content: parsed.content.trim(),
        path: filePath,
      };
    });
}

export function readPlaybook(dataDir: string, slug: string, name: string): Playbook | null {
  const filePath = path.join(playbooksDir(dataDir, slug), `${name}.md`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = matter(raw);
  return {
    slug,
    name,
    frontmatter: parsed.data as PlaybookFrontmatter,
    content: parsed.content.trim(),
    path: filePath,
  };
}

export function writePlaybook(dataDir: string, slug: string, playbook: Playbook): void {
  const dir = playbooksDir(dataDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${playbook.name}.md`);
  const raw = matter.stringify(playbook.content, playbook.frontmatter);
  fs.writeFileSync(filePath, raw, "utf-8");
}
```

### Trigger DSL

```typescript
export function parseTrigger(triggerStr: string): TriggerCondition[] {
  const tokens = triggerStr.split(/\s+AND\s+/).map((t) => t.trim()).filter(Boolean);
  return tokens.map((token): TriggerCondition => {
    if (token.startsWith("deal_stage_")) {
      return { type: "stage", stage: token.slice("deal_stage_".length) };
    }
    const valueGt = token.match(/^value\s*>\s*(\d+)$/);
    if (valueGt) return { type: "value_gt", value: Number(valueGt[1]) };

    const valueLt = token.match(/^value\s*<\s*(\d+)$/);
    if (valueLt) return { type: "value_lt", value: Number(valueLt[1]) };

    const stalledGt = token.match(/^days_stalled\s*>\s*(\d+)$/);
    if (stalledGt) return { type: "days_stalled_gt", value: Number(stalledGt[1]) };

    const stalledLt = token.match(/^days_stalled\s*<\s*(\d+)$/);
    if (stalledLt) return { type: "days_stalled_lt", value: Number(stalledLt[1]) };

    const healthLt = token.match(/^health\s*<\s*(\d+)$/);
    if (healthLt) return { type: "health_lt", value: Number(healthLt[1]) };

    const healthGt = token.match(/^health\s*>\s*(\d+)$/);
    if (healthGt) return { type: "health_gt", value: Number(healthGt[1]) };

    if (token === "no_champion") return { type: "no_champion" };
    if (token === "has_champion") return { type: "has_champion" };

    // Unknown token — no-op condition (always true, doesn't block match)
    return { type: "no_champion" }; // safe fallback: treated as informational
  });
}

export function evaluateCondition(
  cond: TriggerCondition,
  deal: DealSnapshot,
  daysSinceContact: number
): boolean {
  switch (cond.type) {
    case "stage":          return deal.stage === cond.stage;
    case "value_gt":       return deal.value > (cond.value ?? 0);
    case "value_lt":       return deal.value < (cond.value ?? Infinity);
    case "days_stalled_gt": return daysSinceContact > (cond.value ?? 0);
    case "days_stalled_lt": return daysSinceContact < (cond.value ?? Infinity);
    case "health_lt":      return deal.healthScore < (cond.value ?? 100);
    case "health_gt":      return deal.healthScore > (cond.value ?? 0);
    case "no_champion":    return !deal.championPresent;
    case "has_champion":   return deal.championPresent;
    default:               return true;
  }
}

export function evaluateTrigger(
  conditions: TriggerCondition[],
  deal: DealSnapshot,
  daysSinceContact: number = 0
): boolean {
  return conditions.every((c) => evaluateCondition(c, deal, daysSinceContact));
}
```

### Matching

```typescript
export function matchPlaybooks(
  playbooks: Playbook[],
  deal: DealSnapshot,
  daysSinceContact: number = 0
): PlaybookMatch[] {
  const results: PlaybookMatch[] = [];
  for (const pb of playbooks) {
    const conditions = parseTrigger(pb.frontmatter.trigger);
    if (conditions.length === 0) continue;
    const matchedConditions = conditions.filter((c) =>
      evaluateCondition(c, deal, daysSinceContact)
    );
    const score = matchedConditions.length / conditions.length;
    if (score === 1.0) {
      results.push({
        playbook: pb,
        score,
        matchedConditions,
        totalConditions: conditions.length,
      });
    }
  }
  // Sort by successRate desc, then usedCount desc
  return results.sort((a, b) => {
    const rateDiff = (b.playbook.frontmatter.successRate ?? 0) - (a.playbook.frontmatter.successRate ?? 0);
    if (rateDiff !== 0) return rateDiff;
    return (b.playbook.frontmatter.usedCount ?? 0) - (a.playbook.frontmatter.usedCount ?? 0);
  });
}

export function getBestPlaybook(
  dataDir: string,
  slug: string,
  deal: DealSnapshot,
  daysSinceContact: number = 0
): PlaybookMatch | null {
  const all = listPlaybooks(dataDir, slug);
  const matches = matchPlaybooks(all, deal, daysSinceContact);
  return matches[0] ?? null;
}
```

### Distillation (LLM-powered)

```typescript
export function buildDistillPrompt(
  slug: string,
  dealName: string,
  outcome: "won" | "lost",
  interactions: string  // raw interactions.md content
): string {
  return `You are analyzing a sales deal to extract a reusable playbook.

Customer: ${slug}
Deal: ${dealName}
Outcome: ${outcome}
Interactions (chronological):
${interactions.slice(0, 4000)}

Extract a reusable playbook from this deal's journey.

Allowed trigger tokens (combine with " AND "):
- deal_stage_<stage>   (e.g. deal_stage_negotiation)
- value > <n>          (e.g. value > 50000)
- value < <n>
- days_stalled > <n>   (e.g. days_stalled > 7)
- health < <n>         (e.g. health < 60)
- health > <n>
- no_champion
- has_champion

Return JSON only:
{
  "name": "<kebab-case-playbook-name>",
  "trigger": "<DSL string>",
  "content": "<markdown with ## Situation, ## Steps, ## Warnings sections>",
  "successRate": <0.0-1.0>,
  "reasoning": "<why these trigger conditions>"
}`;
}

export function parseLlmDistillation(response: string): LlmDistillation | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Partial<LlmDistillation>;
    if (!parsed.name || !parsed.trigger || !parsed.content) return null;
    return {
      name: parsed.name,
      trigger: parsed.trigger,
      content: parsed.content,
      successRate: typeof parsed.successRate === "number" ? parsed.successRate : (outcome === "won" ? 1.0 : 0.0),
      reasoning: parsed.reasoning ?? "",
    };
  } catch {
    return null;
  }
}
// Note: parseLlmDistillation ist eine pure Funktion — outcome wird im Caller übergeben

export async function distillPlaybook(
  dataDir: string,
  slug: string,
  dealName: string,
  outcome: "won" | "lost",
  llmFn: (prompt: string) => Promise<string> = callLlm
): Promise<{ playbook: Playbook; reasoning: string } | null> {
  const interactionsPath = path.join(dataDir, "customers", slug, "interactions.md");
  if (!fs.existsSync(interactionsPath)) return null;
  const interactions = fs.readFileSync(interactionsPath, "utf-8");

  const prompt = buildDistillPrompt(slug, dealName, outcome, interactions);
  const response = await llmFn(prompt);
  const distillation = parseLlmDistillation(response);
  if (!distillation) return null;

  const name = distillation.name.replace(/[^a-z0-9-]/g, "-").toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const playbook: Playbook = {
    slug,
    name,
    frontmatter: {
      trigger: distillation.trigger,
      successRate: distillation.successRate,
      usedCount: 1,
      lastUpdated: today,
    },
    content: distillation.content,
    path: path.join(playbooksDir(dataDir, slug), `${name}.md`),
  };

  writePlaybook(dataDir, slug, playbook);
  return { playbook, reasoning: distillation.reasoning };
}
```

---

## Datei 2: `src/mcp/tools/get-playbook.ts`

```typescript
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listPlaybooks, matchPlaybooks, parseTrigger } from "../../core/playbooks.js";
import type { DealSnapshot } from "../../core/revenue-simulation.js";

const DATA_DIR = process.cwd();

export async function handleGetPlaybook(
  input: {
    slug: string;
    stage?: string;
    value?: number;
    healthScore?: number;
    daysSinceContact?: number;
    championPresent?: boolean;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const playbooks = listPlaybooks(dataDir, input.slug);
    if (playbooks.length === 0) {
      return {
        content: [{ type: "text", text: JSON.stringify({ matches: [], totalPlaybooks: 0, slug: input.slug }, null, 2) }],
      };
    }

    // If deal context provided, match; else return all
    const hasDealContext =
      input.stage !== undefined ||
      input.value !== undefined ||
      input.healthScore !== undefined;

    if (!hasDealContext) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            matches: playbooks.map((pb) => ({
              name: pb.name,
              trigger: pb.frontmatter.trigger,
              successRate: pb.frontmatter.successRate,
              usedCount: pb.frontmatter.usedCount,
              content: pb.content,
            })),
            totalPlaybooks: playbooks.length,
            slug: input.slug,
          }, null, 2),
        }],
      };
    }

    const mockDeal: DealSnapshot = {
      slug: input.slug,
      name: "",
      stage: input.stage ?? "lead",
      value: input.value ?? 0,
      probability: 50,
      healthScore: input.healthScore ?? 60,
      daysSinceContact: input.daysSinceContact ?? 0,
      championPresent: input.championPresent ?? false,
    };
    const matches = matchPlaybooks(playbooks, mockDeal, input.daysSinceContact ?? 0);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          matches: matches.map((m) => ({
            name: m.playbook.name,
            score: m.score,
            matchedConditions: m.matchedConditions,
            trigger: m.playbook.frontmatter.trigger,
            successRate: m.playbook.frontmatter.successRate,
            usedCount: m.playbook.frontmatter.usedCount,
            content: m.playbook.content,
          })),
          totalPlaybooks: playbooks.length,
          slug: input.slug,
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2) }],
    };
  }
}

export function registerGetPlaybook(server: McpServer): void {
  server.registerTool(
    "get_playbook",
    {
      title: "Get Playbook",
      description: `Retrieve playbooks for a customer. If deal context is provided (stage, value, healthScore), returns only matching playbooks sorted by success rate. Without deal context, returns all playbooks.

Use after run_deal_agent to get specific guidance for the current deal situation.

Args:
  slug: Customer ID
  stage?: Deal stage (e.g. "negotiation")
  value?: Deal value in euros
  healthScore?: Relationship health score 0–100
  daysSinceContact?: Days since last contact (used for days_stalled trigger)
  championPresent?: Whether a champion is identified

Returns: { matches: [{ name, score, trigger, successRate, content }], totalPlaybooks, slug }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer ID"),
        stage: z.string().optional().describe("Deal stage"),
        value: z.number().optional().describe("Deal value in euros"),
        healthScore: z.number().optional().describe("Health score 0–100"),
        daysSinceContact: z.number().optional().describe("Days since last contact"),
        championPresent: z.boolean().optional().describe("Champion identified"),
      }),
    },
    async ({ slug, stage, value, healthScore, daysSinceContact, championPresent }) =>
      handleGetPlaybook({
        slug,
        ...(stage !== undefined ? { stage } : {}),
        ...(value !== undefined ? { value } : {}),
        ...(healthScore !== undefined ? { healthScore } : {}),
        ...(daysSinceContact !== undefined ? { daysSinceContact } : {}),
        ...(championPresent !== undefined ? { championPresent } : {}),
      }, DATA_DIR)
  );
}
```

---

## Datei 3: `src/mcp/tools/create-playbook.ts`

```typescript
export async function handleCreatePlaybook(
  input: {
    slug: string;
    name: string;
    trigger: string;
    content: string;
    successRate?: number;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }>

export function registerCreatePlaybook(server: McpServer): void
// inputSchema: { slug, name, trigger, content, successRate? }
// Normalisiert name zu kebab-case, setzt successRate=0.5 default, usedCount=0, lastUpdated=today
// Returns: { success: true, playbook: { name, trigger, path } }
```

---

## Datei 4: `src/mcp/tools/list-playbooks.ts`

```typescript
export async function handleListPlaybooks(
  input: { slug: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }>

export function registerListPlaybooks(server: McpServer): void
// inputSchema: { slug }
// Returns: { playbooks: [{ name, trigger, successRate, usedCount, lastUpdated }], count, slug }
// Kein Content-Body in der Liste (Performance — Body ist oft groß)
```

---

## Datei 5: `src/mcp/tools/distill-playbook.ts`

```typescript
export async function handleDistillPlaybook(
  input: { slug: string; dealName: string; outcome: "won" | "lost" },
  dataDir: string = DATA_DIR,
  llmFn?: (prompt: string) => Promise<string>
): Promise<{ content: Array<{ type: "text"; text: string }> }>

export function registerDistillPlaybook(server: McpServer): void
// inputSchema: { slug, dealName, outcome: enum ["won", "lost"] }
// Returns on success: { success: true, playbook: { name, trigger, path }, reasoning }
// Returns on no interactions: { success: false, error: "No interactions.md found for <slug>" }
// Returns on LLM parse fail: { success: false, error: "LLM response could not be parsed as playbook" }
```

---

## D13-Integration: `src/agents/deal-agent.ts`

### Änderungen (minimal, rückwärtskompatibel)

**1. Imports hinzufügen:**
```typescript
import { listPlaybooks, matchPlaybooks, type PlaybookMatch } from "../core/playbooks.js";
```

**2. `DealObservation` erweitern (optional field):**
```typescript
export interface DealObservation {
  // ... alle bestehenden Felder unverändert ...
  matchingPlaybooks?: PlaybookMatch[];  // NEU, optional
}
```

**3. `observeDeal` — Playbooks laden:**
```typescript
// Am Ende von observeDeal, vor return:
const allPlaybooks = listPlaybooks(dataDir, slug);
const matchingPlaybooks = matchPlaybooks(allPlaybooks, dealSnapshot, observation.daysSinceContact);
if (matchingPlaybooks.length > 0) {
  observation.matchingPlaybooks = matchingPlaybooks;
}
```

**4. `buildLlmPrompt` — Playbook-Kontext:**
```typescript
// Wenn obs.matchingPlaybooks?.length > 0:
`## Matching Playbooks (${obs.matchingPlaybooks.length} found)
${obs.matchingPlaybooks.slice(0, 2).map((m) =>
  `### ${m.playbook.name} (success rate: ${Math.round(m.playbook.frontmatter.successRate * 100)}%)
${m.playbook.content.slice(0, 500)}`
).join("\n\n")}
`
```

**5. `buildRuleBasedAnalysis` — Playbooks als erste Plan-Items:**
```typescript
// Wenn obs.matchingPlaybooks?.length > 0:
const playbookActions = obs.matchingPlaybooks.slice(0, 2).map((m): DealAgentAction => ({
  actionId: makeActionId(),
  type: "alert",
  payload: {
    message: `Playbook available: "${m.playbook.name}" (${Math.round(m.playbook.frontmatter.successRate * 100)}% success rate)`,
    playbookContent: m.playbook.content.slice(0, 1000),
  },
  confidence: m.playbook.frontmatter.successRate,
  reasoning: `Trigger matched: ${m.playbook.frontmatter.trigger}`,
  requiresHumanApproval: false,
  status: "pending",
  createdAt: new Date().toISOString(),
}));
// prepend to plan
```

---

## TDD — Test-Spezifikationen

### `__tests__/core/playbooks.test.ts`

#### parseTrigger
```
✓ returns empty array for empty string
✓ parses single deal_stage_ token
✓ parses value > n token
✓ parses value < n token
✓ parses days_stalled > n token
✓ parses health < n token
✓ parses health > n token
✓ parses no_champion token
✓ parses has_champion token
✓ parses multiple AND conditions
✓ is case-sensitive for stage (deal_stage_negotiation)
```

#### evaluateCondition / evaluateTrigger
```
✓ stage: matches when deal.stage === condition.stage
✓ stage: returns false when mismatch
✓ value_gt: returns true when deal.value > n
✓ value_gt: returns false when deal.value <= n
✓ days_stalled_gt: uses daysSinceContact as proxy
✓ health_lt: matches low health
✓ health_gt: matches high health
✓ no_champion: matches when !deal.championPresent
✓ has_champion: matches when deal.championPresent
✓ evaluateTrigger: all conditions must match (AND)
✓ evaluateTrigger: returns false if one condition fails
✓ evaluateTrigger: returns true for empty conditions array
```

#### listPlaybooks / readPlaybook / writePlaybook
```
✓ listPlaybooks: returns empty array when dir missing
✓ listPlaybooks: returns parsed playbooks from memfs
✓ listPlaybooks: parses YAML frontmatter correctly
✓ readPlaybook: returns null for missing file
✓ readPlaybook: returns playbook with frontmatter and content
✓ writePlaybook: creates file, readable back with readPlaybook
✓ writePlaybook: creates playbooks dir if missing
```

#### matchPlaybooks / getBestPlaybook
```
✓ matchPlaybooks: returns empty when no playbooks
✓ matchPlaybooks: returns match for exact trigger
✓ matchPlaybooks: excludes partial matches (score < 1.0)
✓ matchPlaybooks: sorts by successRate desc
✓ matchPlaybooks: sorts by usedCount when successRate tied
✓ getBestPlaybook: returns null when no match
✓ getBestPlaybook: returns highest-scoring match
```

#### buildDistillPrompt / parseLlmDistillation
```
✓ buildDistillPrompt: includes slug, dealName, outcome, interactions
✓ buildDistillPrompt: includes allowed trigger tokens
✓ parseLlmDistillation: parses valid JSON response
✓ parseLlmDistillation: returns null for non-JSON response
✓ parseLlmDistillation: returns null when required fields missing
✓ parseLlmDistillation: extracts name, trigger, content, successRate
```

#### distillPlaybook (integration, memfs)
```
✓ returns null when interactions.md missing
✓ writes playbook file on successful LLM response
✓ returns null when LLM response unparseable
✓ normalizes name to kebab-case
```

### `__tests__/mcp/tools/get-playbook.test.ts`
```
✓ returns empty matches when no playbooks dir
✓ returns all playbooks when no deal context provided
✓ returns only matching playbooks when deal context provided
✓ returns empty matches when no trigger conditions met
✓ returns matches sorted by successRate
```

### `__tests__/mcp/tools/create-playbook.test.ts`
```
✓ creates playbook file
✓ normalizes name to kebab-case
✓ sets default successRate=0.5 when not provided
✓ returns success response with path
```

### `__tests__/mcp/tools/list-playbooks.test.ts`
```
✓ returns empty list for new customer
✓ returns list without body content
✓ returns count in response
✓ includes trigger and successRate per playbook
```

### `__tests__/mcp/tools/distill-playbook.test.ts`
```
✓ returns error when no interactions.md
✓ calls llmFn with prompt
✓ writes playbook and returns success on valid LLM response
✓ returns error when LLM response unparseable
✓ returns reasoning in success response
```

### D13-Integration (neue Tests in `__tests__/agents/deal-agent.test.ts`)
```
✓ observeDeal: includes matchingPlaybooks when playbooks.md matches deal state
✓ observeDeal: matchingPlaybooks is empty/absent when no playbooks dir
✓ buildRuleBasedAnalysis: includes playbook alert as first plan item when matched
```

---

## Implementierungsreihenfolge (10 Schritte)

```
Schritt 1: Tests schreiben
  → __tests__/core/playbooks.test.ts              (alle rot)
  → __tests__/mcp/tools/get-playbook.test.ts      (alle rot)
  → __tests__/mcp/tools/create-playbook.test.ts   (alle rot)
  → __tests__/mcp/tools/list-playbooks.test.ts    (alle rot)
  → __tests__/mcp/tools/distill-playbook.test.ts  (alle rot)

Schritt 2: Typen + parseTrigger + evaluateCondition/evaluateTrigger
  → src/core/playbooks.ts — pure DSL-Funktionen
  → npm test → DSL-Tests grün

Schritt 3: Datei-Operationen
  → listPlaybooks, readPlaybook, writePlaybook
  → npm test → Datei-Tests grün

Schritt 4: matchPlaybooks + getBestPlaybook
  → npm test → Match-Tests grün

Schritt 5: buildDistillPrompt + parseLlmDistillation + distillPlaybook
  → npm test → Distillation-Tests grün

Schritt 6: MCP-Tools
  → src/mcp/tools/get-playbook.ts
  → src/mcp/tools/create-playbook.ts
  → src/mcp/tools/list-playbooks.ts
  → src/mcp/tools/distill-playbook.ts
  → npm test → MCP-Tests grün

Schritt 7: D13-Integration
  → src/agents/deal-agent.ts — DealObservation + matchingPlaybooks (optional)
  → observeDeal + buildLlmPrompt + buildRuleBasedAnalysis Updates
  → npm test → D13-Integrations-Tests grün, alle alten D13-Tests noch grün

Schritt 8: server.ts + capabilities.ts
  → registerGetPlaybook, registerCreatePlaybook, registerListPlaybooks, registerDistillPlaybook
  → src/mcp/capabilities.ts — 4 neue Tools (23 gesamt)
  → npm test → alle grün

Schritt 9: Full-Suite + Build + Typecheck
  → npm test → alle Tests grün
  → npm run build → kein Fehler
  → npm run typecheck → kein Fehler

Schritt 10: Docs + Commit
  → README.md, docs/mcp-tools.md, docs/index.html
  → git commit + git push
```

---

## Wichtige Implementierungsdetails (Fallstricke)

### `gray-matter` für YAML-Frontmatter

D15 nutzt `gray-matter` (bereits in Dependencies für Kontext-Builder).
`matter.stringify(content, data)` schreibt `---\nYAML\n---\nContent`.
Achtung: `matter(raw).content` enthält einen führenden Newline → `.trim()` nötig.

```typescript
// RICHTIG:
content: parsed.content.trim()

// matter.stringify schreibt content NACH dem YAML-Block:
const raw = matter.stringify(playbook.content, playbook.frontmatter);
// → "---\ntrigger: ...\n---\n\n<content>"
```

### `exactOptionalPropertyTypes` in DealObservation

```typescript
// FALSCH — matchingPlaybooks kann [] sein, aber nicht undefined:
observation.matchingPlaybooks = matchingPlaybooks.length > 0 ? matchingPlaybooks : undefined;

// RICHTIG — nur setzen wenn nicht leer:
if (matchingPlaybooks.length > 0) {
  observation.matchingPlaybooks = matchingPlaybooks;
}
```

### `exactOptionalPropertyTypes` in MCP handlers

Alle optionalen Inputs in MCP callbacks via conditional spread:
```typescript
async ({ slug, stage, value, healthScore, daysSinceContact, championPresent }) =>
  handleGetPlaybook({
    slug,
    ...(stage !== undefined ? { stage } : {}),
    ...(value !== undefined ? { value } : {}),
    // etc.
  }, DATA_DIR)
```

### parseLlmDistillation — outcome nicht im Closure

`parseLlmDistillation` ist eine pure Funktion (testbar ohne LLM-Call).
Der `outcome`-Parameter (für den successRate-Fallback) wird im **Caller** (`distillPlaybook`)
übergeben — nicht im Parser selbst. Also:

```typescript
// Im Parser: successRate aus JSON oder Fallback-Wert aus caller
export function parseLlmDistillation(
  response: string,
  outcomeFallback: number = 0.5
): LlmDistillation | null {
  // ...
  successRate: typeof parsed.successRate === "number" ? parsed.successRate : outcomeFallback,
}

// Im Caller:
const distillation = parseLlmDistillation(response, outcome === "won" ? 1.0 : 0.0);
```

### days_stalled Proxy — explizit dokumentieren

Im Code-Kommentar und in `evaluateCondition`:
```typescript
case "days_stalled_gt":
  // v1: days_stalled = daysSinceContact (proxy; stage-change timestamps not tracked yet)
  return daysSinceContact > (cond.value ?? 0);
```

### D13-Tests bleiben unverändert

`matchingPlaybooks` ist optional in `DealObservation`. In D13-Tests gibt es kein
`playbooks/`-Verzeichnis in memfs → `listPlaybooks` → `[]` → `matchPlaybooks` → `[]` →
`matchingPlaybooks` wird nicht gesetzt. Alle bestehenden D13-Tests bleiben grün.

### Kebab-Case Normalisierung

```typescript
const name = input.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase().replace(/-+/g, "-").replace(/^-|-$/g, "");
```

---

## Daten-Abhängigkeiten

```
customers/<slug>/interactions.md  ─── (für distillPlaybook LLM prompt) ──▶ distillPlaybook
customers/<slug>/playbooks/*.md   ─── listPlaybooks ───────────────────▶ matchPlaybooks
                                                                              ↓
DealSnapshot (aus D14/D13)        ──────────────────────────────────────▶ evaluateTrigger
                                                                              ↓
                                                               PlaybookMatch[] (score=1.0)
                                                                              ↓
                                              get_playbook MCP Response / run_deal_agent Plan
```

```
Für distill_playbook:
interactions.md + dealName + outcome  →  buildDistillPrompt  →  LLM  →  parseLlmDistillation
                                                                              ↓
                                                                       writePlaybook → .md
```

---

## Test-Count Prognose

| Datei | Tests |
|---|---|
| `__tests__/core/playbooks.test.ts` | ~35 |
| `__tests__/mcp/tools/get-playbook.test.ts` | ~5 |
| `__tests__/mcp/tools/create-playbook.test.ts` | ~4 |
| `__tests__/mcp/tools/list-playbooks.test.ts` | ~4 |
| `__tests__/mcp/tools/distill-playbook.test.ts` | ~5 |
| D13-Integrationstests (neu in deal-agent.test.ts) | ~3 |
| **Gesamt neue Tests** | **~56** |
| Gesamt nach D15 | **~1141** |

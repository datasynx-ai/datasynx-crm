# DatasynxOpenCRM v2 — Plan: Die nächste Generation (dxc)

> Basis: "The Agentic CRM Paradigm" Research (Mai 2026) + v1-Ist-Stand (778 Tests, 14 MCP-Tools, 9 Konnektoren)
> Datum: 2026-05-27 | Autor: Lead Dev (autonom entschieden)

---

## Executive Summary

v1 hat das Fundament gelegt: lokale Markdown-Daten, 14 MCP-Tools, alle großen Sync-Provider, RBAC/GDPR, Plugin-System. Das reicht für "ersetzt HubSpot für Solo-Developer".

v2 ist etwas anderes. v2 ist das, was die Research als **"Living Knowledge Graph orchestrated by specialized agents"** beschreibt — das Produkt, das Attio ($116M), Day.ai (Sequoia), und Salesforce Agentforce ($1.4B ARR) anstreben, aber keiner fertig hat:

> **Ein CRM das nicht wartet bis der Nutzer es fragt. Es handelt. Es erkennt Muster. Es warnt. Es schlägt vor. Es schließt ab.**

Die Differenzierung zu allem anderen: **local-first, npm-installierbar, framework-agnostisch via MCP, keine Cloud-Abhängigkeit, voller Quellcode.** Das ist der Moat. Salesforce braucht eine Firma. dxcrm v2 braucht `npm install`.

---

## Was v1 kann (Baseline)

| Layer | v1-Stand |
|---|---|
| Datenspeicher | Markdown + YAML Frontmatter + LanceDB (Vektoren) |
| Episodisches Gedächtnis | `interactions.md` — jeder Call, Mail, Meeting |
| Semantisches Gedächtnis | `main_facts.md` + LanceDB-Vektorindex |
| Prozedurales Gedächtnis | — (fehlt) |
| Sync-Quellen | Gmail, Outlook, Drive, Teams, Meet |
| MCP-Tools | 14 (inkl. health, forecast, intelligence) |
| CRM-Import | 9 Konnektoren (HubSpot v4, Salesforce Bulk, Pipedrive v2, ...) |
| Sicherheit | RBAC, GDPR, AES-256-GCM, Webhooks, WorkOS SSO |
| Plugin-System | Slack, Stripe, Linear |
| Frameworks | Claude Code, Codex, Grok, OpenClaw, Hermes, Antigravity, Cursor, Windsurf, Cline |

---

## Was v2 hinzufügt — Die 10 neuen Domino-Steine

```
D11 — Knowledge Graph Layer (Beziehungen als Graph, nicht als Tabelle)
D12 — Relationship Health Engine (Decay Detection, Champion Mapping)
D13 — Autonomous Deal Agent (stateful, multi-step, goal-directed)
D14 — Revenue Simulation Engine (Monte Carlo, Echtzeit-Externe-Signale)
D15 — Procedural Memory / Playbooks (was Top-Performer bei diesem Dealtyp tun)
D16 — Goal-Based Orchestration ("Close $2M this quarter" → agent dekomponiert + executes)
D17 — Real-Time Push Ingestion (Gmail Pub/Sub, Graph Webhooks, Slack Events)
D18 — Org Intelligence Layer (Stakeholder-Mapping, Blocker-Erkennung, Champion-Tracking)
D19 — Multi-Agent Deal Room (Pricing Agent + Legal Agent + Competitor Agent)
D20 — Proactive Agent (cron-driven, sendet selbst Alerts, Summaries, next-step Nudges)
```

---

## Architektur-Upgrade: v1 → v2

### v1-Architektur (flach)

```
customers/acme-corp/
├── main_facts.md        ← Semantik (YAML)
├── interactions.md      ← Episodik (Markdown Liste)
└── pipeline.md          ← Deals (Markdown Tabelle)
```

### v2-Architektur (Graph + Memory Stack)

```
customers/acme-corp/
├── main_facts.md              ← Semantik (unverändert — User bleibt Markdown)
├── interactions.md            ← Episodik (unverändert)
├── pipeline.md                ← Deals (unverändert)
├── graph.json                 ← NEU: Beziehungsgraph (Knoten + Kanten)
├── health.json                ← NEU: Relationship Health Scores (time-series)
├── playbooks/                 ← NEU: Prozedurales Gedächtnis
│   └── enterprise-renewal.md
└── signals/                   ← NEU: Externe Signale (Funding, LinkedIn, News)
    └── 2026-05-27.json

.agentic/
├── (v1-Dateien unverändert)
├── goals.json                 ← NEU: Aktive Goals mit Fortschritt
├── agent-queue.json           ← NEU: Autonome Tasks (Proactive Agent)
├── simulation-cache.json      ← NEU: Monte Carlo Cache
└── push-subscriptions.json    ← NEU: Gmail/Graph/Slack Push-Registrierungen
```

### Memory-Stack (CoALA-Framework mapping)

| Cognitive Layer | v2-Implementierung | Datei |
|---|---|---|
| Working Memory | LLM Context Window | (Agent-intern) |
| Episodic Memory | Alle Interactions + Signals | `interactions.md` + `signals/` |
| Semantic Memory | Facts + Graph-Knoten | `main_facts.md` + `graph.json` |
| Procedural Memory | Playbooks (gelerntes Verhalten) | `playbooks/` |
| Org Context Memory | Stakeholder-Graph + Team-State | `graph.json` + `.agentic/org.json` |

---

## Domino D11 — Knowledge Graph Layer

### Warum

Salesforce und HubSpot speichern Kontakte als Zeilen. Die Realität ist ein Graph: Max Müller kennt Sarah Schmidt, Sarah ist die eigentliche Economic Buyer, Max ist Champion. Diese Beziehungsstruktur ist der Alpha-Layer.

### Datenmodell

```typescript
// src/core/graph.ts

interface GraphNode {
  id: string;           // "person:max.mueller@acme.com" | "company:acme.com"
  type: "person" | "company" | "deal" | "product" | "event";
  label: string;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface GraphEdge {
  id: string;
  from: string;         // Node-ID
  to: string;           // Node-ID
  type: EdgeType;
  weight: number;       // 0–1 (Stärke der Beziehung)
  sentiment: number;    // -1 bis +1
  lastContact: string;  // ISO-Date
  contactCount: number;
  properties: Record<string, unknown>;
}

type EdgeType =
  | "KNOWS"           // Person kennt Person
  | "WORKS_AT"        // Person arbeitet bei Company
  | "IS_CHAMPION"     // Person ist Deal-Champion
  | "IS_BLOCKER"      // Person blockiert Deal
  | "IS_ECONOMIC_BUYER"
  | "INTRODUCED_BY"   // warm introduction path
  | "OWNS_DEAL"       // Person verantwortet Deal
  | "COMPETES_WITH";  // Company vs. Company

interface CustomerGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  updatedAt: string;
}
```

### API

```typescript
// Core functions
readGraph(dataDir: string, slug: string): CustomerGraph
writeGraph(dataDir: string, slug: string, graph: CustomerGraph): void
addNode(dataDir: string, slug: string, node: GraphNode): void
addEdge(dataDir: string, slug: string, edge: GraphEdge): void
updateEdgeWeight(dataDir: string, slug: string, edgeId: string, delta: number): void
findPath(graph: CustomerGraph, fromId: string, toId: string): GraphNode[]   // warm intro path
getStakeholders(graph: CustomerGraph, dealId: string): StakeholderMap
```

### MCP-Tool

```typescript
// get_relationship_graph({ slug }) →
{
  nodes: [...],
  edges: [...],
  champions: ["max.mueller@acme.com"],
  blockers: [],
  economicBuyers: ["sarah.schmidt@acme.com"],
  warmIntroPath: ["our.contact@partner.com", "sarah.schmidt@acme.com"]
}
```

### Auto-Population

Bei jedem `log_interaction` werden automatisch extrahiert:
- Person-Knoten für alle "with"-Felder
- KNOWS-Kanten zwischen Personen die im gleichen Thread waren
- Edge-Gewicht erhöht sich mit jeder Interaktion
- Sentiment-Update via LLM-Analyse der Summary

---

## Domino D12 — Relationship Health Engine

### Warum

Die Research zitiert: "Relationship Decay Detection: a proactive alert when communication cadence breaks a learned baseline — before the relationship goes cold." Das ist der einzige Feature, der mehr Deals rettet als jedes CRM-Feature davor.

### Scoring-Modell

```typescript
// src/core/relationship-health.ts

interface RelationshipHealth {
  contactId: string;
  slug: string;
  score: number;           // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  trend: "rising" | "stable" | "declining" | "cold";
  daysSinceContact: number;
  avgCadenceDays: number;  // gelernter Baseline
  sentimentTrend: number;  // -1 bis +1 über letzte 5 Interaktionen
  riskFlags: RiskFlag[];
  lastUpdated: string;
}

type RiskFlag =
  | "NO_CONTACT_14D"
  | "NO_CONTACT_30D"
  | "SENTIMENT_DECLINING"
  | "RESPONSE_LATENCY_INCREASING"
  | "CONTACT_LEFT_COMPANY"   // Signal: LinkedIn/Clearbit
  | "CHAMPION_SILENT"
  | "DEAL_STALLED"
  | "CLOSE_DATE_PASSED";
```

### Algorithmus

```
Score = (
  Recency-Score         × 0.35  // 0 bei >30d, 100 bei <3d
  + Cadence-Score       × 0.25  // Abweichung vom gelernten Rhythmus
  + Sentiment-Score     × 0.20  // Durchschnitt letzte 5 Interaktionen
  + Response-Score      × 0.10  // Reply-Latenz-Trend
  + Momentum-Score      × 0.10  // Anzahl Interaktionen letzte 30d vs. Vormonat
)
```

### MCP-Tool

```typescript
// get_relationship_health({ slug }) →
{
  contacts: [
    {
      name: "Max Müller",
      score: 42,
      grade: "D",
      trend: "declining",
      riskFlags: ["NO_CONTACT_14D", "SENTIMENT_DECLINING"],
      lastContact: "2026-05-13",
      recommendation: "Call Max before end of week — sentiment dropped after the last email."
    }
  ],
  overallHealth: 58,
  atRiskContacts: ["max.mueller@acme.com"],
  coldContacts: []
}
```

### Proaktiv-Trigger

Health-Score fällt unter Schwellenwert → `agent-queue.json` bekommt einen Task → Proactive Agent (D20) schickt Alert.

---

## Domino D13 — Autonomous Deal Agent

### Warum

Ein MCP-Tool ist reaktiv — der Agent fragt, das Tool antwortet. Der Autonomous Deal Agent ist andersrum: Er **beobachtet kontinuierlich** den Deal-State und führt selbstständig Aktionen aus, wenn sein Konfidenz-Score hoch genug ist.

Anthropic's eigene Einschätzung aus der Research: *"Tool access is one of the highest-leverage primitives you can give an agent. On benchmarks like LAB-Bench FigQA and SWE-bench, adding even basic tools produces outsized capability gains."*

### Architektur

```typescript
// src/agents/deal-agent.ts

interface DealAgentConfig {
  slug: string;
  dealName: string;
  autonomyLevel: "observe" | "suggest" | "act";
  // observe: nur beobachten + loggen
  // suggest: schlägt Aktionen vor, schickt keine Mails
  // act: führt unter-Schwellenwert-Aktionen autonom aus
  valueThreshold: number;   // unter diesem €-Wert: vollautonome Aktionen
  actor: string;            // DXCRM_ACTOR für Audit-Trail
}

interface DealAgentAction {
  type: "send_followup" | "update_deal" | "log_interaction" | "alert" | "schedule_meeting";
  payload: unknown;
  confidence: number;       // 0–1 — unter 0.7: eskaliert zum User
  reasoning: string;        // inspektierbar (Glass-Box-Requirement)
  requiresHumanApproval: boolean;
}

interface DealAgentTrace {
  timestamp: string;
  dealId: string;
  observation: string;
  plan: string[];
  actionsConsidered: DealAgentAction[];
  actionTaken: DealAgentAction | null;
  outcome: "executed" | "escalated" | "skipped";
}
```

### MCP-Tool: run_deal_agent

```typescript
run_deal_agent({
  slug: "acme-corp",
  dealName: "Enterprise License 2026",
  autonomyLevel: "suggest",    // safe default
  instruction: "Deal stagniert seit 2 Wochen. Was ist zu tun?"
})

// Returns:
{
  assessment: "Deal in Stage 'negotiation' seit 18 Tagen ohne Bewegung.",
  riskLevel: "high",
  plan: [
    { step: 1, action: "Call Max Müller", priority: "urgent", reason: "Letzter Kontakt 18d" },
    { step: 2, action: "Draft executive escalation email", priority: "high" },
    { step: 3, action: "Update close date to 2026-07-15", priority: "medium" }
  ],
  actionsQueued: [],   // bei autonomyLevel: "suggest" — kein Auto-Execute
  trace: { ... }       // vollständige Reasoning-Spur (Glass-Box)
}
```

### MCP-Tool: approve_agent_action

```typescript
approve_agent_action({
  actionId: "da_abc123",
  approved: true
})
// Führt die gequeuete Aktion aus und schreibt Audit-Eintrag
```

---

## Domino D14 — Revenue Simulation Engine

### Warum

"Clari claims 98% accuracy by week 2 of the quarter" — aber das ist ein Punkt-Forecast. Die Research fordert eine **Revenue Simulation**: Monte Carlo über das gesamte Deal-Portfolio mit expliziten Wahrscheinlichkeits-Intervallen und Sensitivitätsanalyse.

### Algorithmus

```typescript
// src/core/revenue-simulation.ts

interface SimulationInput {
  deals: DealSnapshot[];
  externalSignals: ExternalSignal[];  // D18 liefert diese
  iterations: number;                  // default 10_000
  horizon: "quarter" | "year";
}

interface DealSnapshot {
  name: string;
  stage: string;
  value: number;
  probability: number;       // aus pipeline-stages config
  closeDate: string;
  healthScore: number;       // aus D12
  daysSinceContact: number;
  championPresent: boolean;  // aus D11 Graph
}

interface SimulationResult {
  p10: number;   // 10th percentile — schlechtester Fall
  p50: number;   // Median — realistischer Fall
  p90: number;   // 90th percentile — bester Fall
  expected: number;
  stdDev: number;
  atRiskRevenue: number;     // Deals mit Health < 60
  byCloseMonth: Record<string, { p50: number; range: [number, number] }>;
  topRisks: string[];        // konkrete Deals, die Forecast am meisten beeinflussen
  sensitivityMap: Record<string, number>;  // Welcher Deal hat welche Forecast-Auswirkung
}
```

```typescript
// Monte Carlo — vereinfacht
function runSimulation(input: SimulationInput): SimulationResult {
  const outcomes: number[] = [];

  for (let i = 0; i < input.iterations; i++) {
    let total = 0;
    for (const deal of input.deals) {
      const adjustedProb = adjustProbability(deal);  // health + signals adjustieren
      if (Math.random() < adjustedProb) {
        total += deal.value * randomCloseVariance(deal);
      }
    }
    outcomes.push(total);
  }

  outcomes.sort((a, b) => a - b);
  return {
    p10: percentile(outcomes, 10),
    p50: percentile(outcomes, 50),
    p90: percentile(outcomes, 90),
    expected: mean(outcomes),
    stdDev: stdDev(outcomes),
    // ...
  };
}
```

### MCP-Tool: simulate_revenue

```typescript
simulate_revenue({
  horizon: "quarter",
  includeSignals: true
})

// Returns:
{
  forecast: {
    p10: 145000,
    p50: 287500,
    p90: 412000,
    expected: 289300
  },
  confidence: "The P50 forecast has ±39% uncertainty this early in Q3.",
  topRisks: ["acme-corp/Enterprise License: champion silent 18d (-€75k risk)"],
  recommendation: "Prioritize acme-corp contact this week — highest single-deal forecast impact."
}
```

---

## Domino D15 — Procedural Memory / Playbooks

### Warum

Die CoALA-Research unterscheidet: episodisches Gedächtnis (was passiert ist) vs. prozedurales Gedächtnis (was man in bestimmten Situationen tun soll). Top-Performer haben prozedurales Wissen das implizit ist — Playbooks machen es explizit und maschinell nutzbar.

### Datenmodell

```typescript
// customers/acme-corp/playbooks/enterprise-renewal.md

---
trigger: deal_stage_negotiation AND value > 50000 AND days_stalled > 7
successRate: 0.73
usedCount: 14
lastUpdated: 2026-05-20
---

# Enterprise Renewal Playbook

## Situation
Deal in Negotiation > 7 Tage ohne Bewegung, Wert > €50k.

## Bewährtes Vorgehen (aus 14 ähnlichen Deals)
1. Direktanruf beim Economic Buyer (nicht beim Champion)
2. Framing: "Was braucht ihr, damit das intern genehmigt wird?"
3. Angebot: Flexible Zahlungsmodalitäten (Quartals- statt Jahreszahlung)
4. Timeline: Setze konkretes Datum ("Können wir bis Freitag klären?")

## Warnsignale die zum Stopp führen
- Kein Reply innerhalb 3 Werktagen → Eskalation an Manager
- Preisdiskussion geht >2 Runden → Deal vermutlich nicht abschlussbereit

## Template: Escalation-Mail
Subject: Nächste Schritte: [Deal-Name]
Body: [...]
```

### MCP-Tool: get_playbook + create_playbook

```typescript
get_playbook({ slug: "acme-corp", situation: "deal_stalled_negotiation_high_value" })
// Returns: Matching Playbook als Markdown

create_playbook({
  name: "competitor-objection-enterprise",
  trigger: "competitor_mentioned AND stage === 'proposal'",
  content: "..."
})
// Speichert Playbook, wird bei match automatisch von run_deal_agent (D13) vorgeschlagen
```

### Auto-Learning

Nach jedem gewonnenen/verlorenen Deal: `distill_playbook` — LLM analysiert die Interaktionshistorie und extrahiert strukturierte Erkenntnisse als neues oder geupdatetes Playbook.

```typescript
distill_playbook({ slug: "acme-corp", dealName: "Enterprise License 2026", outcome: "won" })
// Analysiert alle Interactions für diesen Deal → generiert/updated Playbook
```

---

## Domino D16 — Goal-Based Orchestration

### Warum

Das ist der qualitative Sprung von "Tool das auf Anfrage antwortet" zu "System das eigenständig Ziele verfolgt". Die Research beschreibt es als: *"Tell the system 'close $2M this quarter from the West region' and the agent decomposes the goal."*

### Implementierung

```typescript
// src/core/goal-engine.ts

interface Goal {
  id: string;
  description: string;              // "Close €500k this quarter"
  type: GoalType;
  target: number;
  metric: "revenue" | "deals_closed" | "meetings_booked" | "pipeline_created";
  deadline: string;
  progress: number;                 // 0–100%
  subGoals: SubGoal[];
  status: "active" | "completed" | "cancelled" | "blocked";
  createdAt: string;
  actor: string;
}

interface SubGoal {
  description: string;
  assignedTo: string;              // Slug oder "system"
  dueDate: string;
  status: "pending" | "in_progress" | "done";
  actionType: "call" | "email" | "update_deal" | "create_customer";
}

type GoalType = "revenue" | "pipeline" | "relationship" | "churn_prevention";
```

### MCP-Tool: pursue_goal

```typescript
pursue_goal({
  goal: "Close €500k ARR this quarter",
  deadline: "2026-09-30",
  context: "Focus on existing pipeline, no new prospecting"
})

// Returns:
{
  goalId: "goal_abc123",
  decomposition: {
    analysis: "Current weighted pipeline: €287k P50. Gap: €213k.",
    subGoals: [
      {
        priority: 1,
        action: "Accelerate acme-corp/Enterprise License",
        why: "Highest value deal (€75k) in negotiation — health score 42",
        nextStep: "Call Max Müller by 2026-05-30",
        targetDelta: 75000
      },
      {
        priority: 2,
        action: "Reactivate beta-gmbh/Renewal (cold since 30d)",
        why: "€50k, was qualified, relationship health F",
        nextStep: "Warm intro via sarah.schmidt@partner.com",
        targetDelta: 50000
      }
      // ...until gap is closed
    ],
    probabilisticOutcome: "P50 forecast after actions: €512k (target: €500k)"
  }
}
```

### Goal-Tracking

```bash
dxcrm goal set "Close €500k this quarter" --deadline 2026-09-30
dxcrm goal status
dxcrm goal update goal_abc123 --progress 45
```

---

## Domino D17 — Real-Time Push Ingestion

### Warum

Polling alle 15 Minuten (v1-Daemon) ist für Ambient Intelligence zu langsam. Eine neue Mail von Acme Corp sollte innerhalb von 60 Sekunden in der Knowledge Base sein, nicht nach 15 Minuten.

### Gmail Pub/Sub (bereits angelegt in D6 — hier vollständig)

```typescript
// src/sync/push-manager.ts

interface PushSubscription {
  provider: "gmail" | "microsoft-graph" | "slack";
  customerId: string;   // Google Project / Tenant ID
  slug?: string;        // Optional: nur für diesen Kunden
  webhookUrl: string;   // ngrok / production URL
  historyId?: string;   // Gmail: letzter verarbeiteter historyId
  expiresAt: string;    // Gmail: max 7 Tage, dann renew
}

// Gmail: watch registrieren
async function registerGmailWatch(slug: string, config: GmailWatchConfig): Promise<PushSubscription>

// Microsoft Graph: delta subscription
async function registerGraphSubscription(resource: string): Promise<PushSubscription>

// Slack: Events API
async function registerSlackEvents(teamId: string, events: string[]): Promise<PushSubscription>

// Renew-Daemon: läuft täglich, erneuert abgelaufene Subscriptions
async function renewExpiringSubscriptions(dataDir: string): Promise<void>
```

### Webhook-Receiver Integration

```typescript
// src/mcp/server.ts — neuer HTTP-Endpunkt

POST /webhooks/gmail
  → verifyGmailPubSub(payload)
  → fetchNewMessagesFromHistory(historyId)
  → für jede neue Mail: matchCustomer() → appendInteraction() → updateGraph()
  → EventEmitter.emit("new_interaction", { slug, interaction })

POST /webhooks/microsoft
  → verifyGraphSubscription(headers)
  → fetchGraphDelta(subscription)
  → ...

POST /webhooks/slack
  → verifySlackSignature(headers, body)
  → processSlackEvent(event)
  → ...
```

### CLI

```bash
dxcrm push register --provider gmail          # Registriert Gmail Push für alle Kunden
dxcrm push register --provider microsoft      # MS Graph Subscriptions
dxcrm push register --provider slack --team-id T12345
dxcrm push status                              # Zeigt alle aktiven Subscriptions + Ablaufdatum
dxcrm push renew                               # Erneuert ablaufende Subscriptions manuell
```

---

## Domino D18 — Org Intelligence Layer

### Warum

"Influence/Champion Mapping: graph-neural-network analysis of the buyer organization to identify likely champions, blockers, and economic buyers." Die Research identifiziert das als Frontier-Feature das noch kein CRM vollständig implementiert hat.

### Stakeholder-Mapping

```typescript
// src/core/org-intelligence.ts

interface StakeholderMap {
  slug: string;
  dealName: string;
  updatedAt: string;
  people: StakeholderProfile[];
  missingRoles: MissingRole[];
  riskAssessment: string;
}

interface StakeholderProfile {
  name: string;
  email: string;
  title: string;
  role: "champion" | "economic_buyer" | "user" | "blocker" | "influencer" | "unknown";
  influence: number;          // 0–10
  sentiment: number;          // -1 bis +1 (aus Interaction-Analyse)
  lastContact: string;
  contactStrength: number;    // 0–1 (aus Graph-Gewicht)
  riskFlags: string[];
}

interface MissingRole {
  role: "economic_buyer" | "champion" | "legal" | "procurement";
  urgency: "critical" | "important" | "nice_to_have";
  suggestion: string;   // "Frag Max nach seinem Manager"
}
```

### Externe Signal-Integration

```typescript
// src/sync/external-signals.ts

interface ExternalSignal {
  slug: string;
  source: "clearbit" | "apollo" | "crunchbase" | "news" | "linkedin_basic";
  type: "funding_round" | "leadership_change" | "layoffs" | "acquisition" | "expansion";
  summary: string;
  detectedAt: string;
  impact: "positive" | "negative" | "neutral";
  raw?: unknown;
}

// Clearbit Enrichment (wenn CLEARBIT_API_KEY gesetzt):
async function enrichContact(email: string): Promise<PersonEnrichment>

// News-Monitoring via RSS/Hacker News Algolia API (kein API-Key nötig):
async function checkCompanyNews(domain: string): Promise<ExternalSignal[]>

// Funding-Alerts via Crunchbase Basic API:
async function checkFundingEvents(domain: string): Promise<ExternalSignal[]>
```

### MCP-Tool: get_org_intelligence

```typescript
get_org_intelligence({ slug: "acme-corp", dealName: "Enterprise License 2026" })

// Returns:
{
  stakeholderMap: {
    champion: { name: "Max Müller", sentiment: 0.6, lastContact: "2026-05-09" },
    economicBuyer: { name: "Sarah Schmidt", sentiment: 0.3, lastContact: "NEVER" },
    blocker: null,
    missingRoles: [{ role: "procurement", urgency: "critical", suggestion: "Ask Max who signs contracts." }]
  },
  externalSignals: [
    { type: "funding_round", summary: "Acme Corp raised Series B (€12M) — budget likely increases", impact: "positive" }
  ],
  recommendation: "Introduce yourself to Sarah Schmidt before end of week. Max is the champion but not the signer."
}
```

---

## Domino D19 — Multi-Agent Deal Room

### Warum

Die Research beschreibt als Frontier: *"a pricing agent, a legal-review agent, a competitor-analysis agent, and a stakeholder-mapping agent collaborating around a shared deal state."* LangGraph-Supervisor-Pattern. Aber: kein LangGraph als Dependency — wir implementieren das lightweight mit dem vorhandenen MCP-Tool-Stack.

### Architektur

```
DealRoom-Orchestrator (neues MCP-Tool)
├── calls: get_relationship_graph          (D11)
├── calls: get_relationship_health         (D12)
├── calls: get_deal_health                 (v1)
├── calls: get_org_intelligence            (D18)
├── calls: simulate_revenue                (D14)
├── calls: get_market_intelligence         (v1)
├── calls: get_playbook                    (D15)
└── synthesizes: strukturierter Deal-Brief
```

```typescript
// src/agents/deal-room.ts

interface DealRoomBrief {
  slug: string;
  dealName: string;
  generatedAt: string;

  // Von D11 — Graph
  stakeholders: StakeholderMap;

  // Von D12 — Health
  relationshipHealth: RelationshipHealth[];

  // Von v1 — Deal Health
  dealHealth: DealHealthResult;

  // Von D14 — Simulation
  revenueSimulation: SimulationResult;

  // Von D18 — External Signals
  externalSignals: ExternalSignal[];

  // Von D15 — Playbook
  recommendedPlaybook: Playbook | null;

  // Von v1 — Market Intel
  competitorMentions: MarketIntelResult;

  // Synthese
  executiveSummary: string;     // 3-Satz-Briefing
  topPriorities: string[];      // Was ist jetzt sofort zu tun
  riskScore: number;            // 0–100
  recommendedActions: DealAgentAction[];
}
```

### MCP-Tool: open_deal_room

```typescript
open_deal_room({
  slug: "acme-corp",
  dealName: "Enterprise License 2026"
})

// Orchestriert 7 sub-tool-calls, gibt vollständigen Deal-Brief zurück.
// Laufzeit: ~3-5 Sekunden (parallel execution wo möglich)
// Glass-Box: gibt alle sub-tool-traces zurück
```

---

## Domino D20 — Proactive Agent

### Warum

Das ist der härteste Paradigmenwechsel: Nicht warten bis gefragt wird. Der Proactive Agent läuft im Hintergrund (via Daemon), checkt alle Kunden täglich und sendet proaktive Alerts.

**Der User soll morgens aufwachen und eine Zusammenfassung haben, die er nicht angefordert hat.**

### Queue-System

```typescript
// .agentic/agent-queue.json

interface AgentTask {
  id: string;
  type: TaskType;
  slug?: string;
  priority: "urgent" | "high" | "normal";
  payload: unknown;
  createdAt: string;
  scheduledFor: string;
  status: "pending" | "processing" | "done" | "failed";
  result?: string;
  channel: NotificationChannel;
}

type TaskType =
  | "daily_briefing"           // Morgens: Top-3 Prioritäten des Tages
  | "relationship_decay_alert" // Health-Score unter Schwellenwert
  | "deal_risk_alert"          // Deal-Health F + close date nähert sich
  | "external_signal_alert"    // Funding/Leadership change bei Kunde
  | "follow_up_nudge"          // "Du hast Max vor 14 Tagen kontaktiert — Zeit?"
  | "goal_progress_update"     // Wöchentliches Goal-Update
  | "pipeline_forecast_weekly" // Montags: Forecast P10/P50/P90
  | "playbook_suggestion";     // Deal passt zu Playbook, Agent schlägt vor

type NotificationChannel = "telegram" | "slack" | "email" | "mcp_tool_response";
```

### Daemon-Integration

```typescript
// src/daemon/proactive-worker.ts — läuft im bestehenden Daemon

async function runDailyProactiveChecks(dataDir: string): Promise<void> {
  const customers = listCustomers(dataDir);

  for (const slug of customers) {
    // D12: Relationship Health Check
    const health = await computeRelationshipHealth(dataDir, slug);
    for (const contact of health.atRisk) {
      enqueueTask({ type: "relationship_decay_alert", slug, priority: "high", ... });
    }

    // D14: Deal Risk Check
    const deals = await getDeals(dataDir, slug);
    for (const deal of deals) {
      if (isDealAtRisk(deal)) {
        enqueueTask({ type: "deal_risk_alert", slug, priority: "urgent", ... });
      }
    }

    // D18: External Signals
    const signals = await checkExternalSignals(dataDir, slug);
    for (const signal of signals) {
      if (signal.impact !== "neutral") {
        enqueueTask({ type: "external_signal_alert", slug, payload: signal, ... });
      }
    }
  }

  // Daily Briefing (immer)
  enqueueTask({ type: "daily_briefing", priority: "normal", scheduledFor: "07:00" });
}
```

### MCP-Tool: get_proactive_briefing

```typescript
get_proactive_briefing({ date: "2026-05-27" })

// Returns:
{
  goodMorning: "3 Dinge die heute wichtig sind:",
  urgent: [
    "📞 Acme Corp: Max Müller hat 18 Tage nichts von dir gehört — Deal-Health F",
    "⚠️ Beta GmbH: Close Date 2026-05-31 in 4 Tagen — kein Sign-off noch"
  ],
  opportunities: [
    "💰 Acme Corp hat Series B abgeschlossen (€12M) — Budget-Gespräch jetzt sinnvoll"
  ],
  forecast: "Q3 Forecast: P50 €287k / P90 €412k — 2 Deals entscheiden alles",
  topAction: "Ruf Max Müller an. Jetzt. Alles andere kann warten."
}
```

---

## Neue MCP-Tools Übersicht (v2-Additions)

| Tool | Domino | RBAC | Beschreibung |
|---|---|---|---|
| `get_relationship_graph` | D11 | any | Beziehungsgraph: Knoten, Kanten, Stakeholder-Rollen |
| `get_relationship_health` | D12 | any | Health-Scores pro Kontakt, Decay-Detection |
| `run_deal_agent` | D13 | rep+ | Autonome Deal-Analyse + optionale Aktionen |
| `approve_agent_action` | D13 | rep+ | Queued Action freigeben |
| `simulate_revenue` | D14 | any | Monte Carlo Pipeline-Forecast |
| `get_playbook` | D15 | any | Matching Playbook für aktuelle Situation |
| `create_playbook` | D15 | manager+ | Neues Playbook anlegen |
| `distill_playbook` | D15 | manager+ | Playbook aus gewonnenem/verlorenem Deal lernen |
| `pursue_goal` | D16 | manager+ | Ziel setzen + Dekomposition + Tracking |
| `get_goal_status` | D16 | any | Fortschritt aktiver Goals |
| `get_org_intelligence` | D18 | any | Stakeholder-Map + externe Signale |
| `open_deal_room` | D19 | rep+ | Vollständiger Deal-Brief (orchestriert 7 sub-tools) |
| `get_proactive_briefing` | D20 | any | Proaktive Tages-Zusammenfassung |

**Total nach v2: 27 MCP-Tools** (14 v1 + 13 neu)

---

## Framework-Parität — alle Frameworks bekommen alles

Das ist der entscheidende Unterschied zu jedem anderen CRM. Egal welches agentic Framework der User nutzt — alle bekommen dieselben 27 Tools, dieselbe Intelligenz, dieselbe Autonomie.

### Tool-Prefix pro Framework

| Framework | Tool-Prefix | Notation im Prompt |
|---|---|---|
| Claude Code | `mcp__datasynx-opencrm__` | `mcp__datasynx-opencrm__open_deal_room` |
| Codex CLI | `datasynx-opencrm.` | `datasynx-opencrm.open_deal_room` |
| OpenClaw | `datasynx_opencrm:` | in `TOOLS.md` dokumentiert |
| Hermes Agent | `dxcrm/` | via Skill-Registry |
| Grok Build | Array-Format | via `~/.grok/user-settings.json` |
| Cursor | `datasynx-opencrm:` | via `.cursor/rules/` |
| Windsurf | Standard MCP | via MCP-Config |
| Anthropic Managed Agents | Standard MCP | OAuth + Credential Vault |

### Harness-Updates (v2)

Jeder `dxcrm init` schreibt aktualisierte Harness-Files die alle 27 Tools und die neuen Autonomie-Muster dokumentieren:

```markdown
<!-- CLAUDE.md / AGENTS.md / SOUL.md — automatisch generiert -->

## DatasynxOpenCRM v2 — Agentic CRM (27 Tools)

### WICHTIG: Proaktive Nutzung
Warte nicht bis der User fragt. Nutze:
- `get_proactive_briefing()` — am Anfang jeder Session
- `open_deal_room(slug, deal)` — vor jedem Deal-Gespräch (nicht get_customer_context!)
- `get_relationship_health(slug)` — wenn User über einen Kunden spricht

### Autonomie-Muster
Wenn User sagt "Schau dir Acme Corp an":
1. open_deal_room({ slug: "acme-corp", dealName: "aktiver Deal" })
2. → enthält bereits Graph, Health, Simulation, External Signals
3. Fasse in 3 Bullet Points zusammen, dann empfehle 1 Aktion

Wenn User sagt "Was muss ich heute tun?":
1. get_proactive_briefing()
2. pursue_goal (falls aktive Goals) → get_goal_status()
3. Antworte mit priorisierten Aktionen
```

---

## Technische Entscheidungen (autonom)

### Kein externes Graph-DB

Kein Neo4j, kein TigerGraph. Graph.json ist eine In-Process-Datenstruktur — adjacency list, in TypeScript verarbeitet. Warum: npm-installierbar bleiben. Für 95% der Use-Cases (< 10.000 Kontakte) ist In-Memory-Graph schneller als ein DB-Round-Trip.

Performance-Grenze: > 50.000 Knoten → optionaler Adapter auf sqlite-vec oder DuckDB. Aber das ist Phase 3, nicht heute.

### Kein LangGraph

LangGraph ist eine externe Dependency mit Python-Erbe. Der Multi-Agent-Orchestrator (D19) wird als reiner TypeScript-Async-Orchestrator implementiert: Promise.allSettled für parallele sub-tool-calls, sequenziell für abhängige. Das reicht für unsere Topologie.

### Monte Carlo in TypeScript

~10.000 Iterationen über ~50 Deals: ~50ms in V8. Keine Python-Bridge, keine separate Service. Pure TypeScript, synchron, deterministisch mit seedrandom für Reproduzierbarkeit in Tests.

### Push-Ingestion via bestehenden HTTP-Server

Der bestehende `dxcrm server start` bekommt `/webhooks/*`-Endpunkte. Kein separater Service. Webhook-URL ist `http://your-server:3847/webhooks/gmail` — dokumentiert in `dxcrm push register`.

### Proactive Agent via bestehenden Daemon

Der v1-Daemon bekommt einen zweiten Worker: `proactive-worker.ts`. Kein neuer Prozess, kein cronjob-Framework. Der Daemon-Loop checked täglich, die Queue wird vom bestehenden Alert-System (Telegram/Slack) abgearbeitet.

---

## Sprint-Plan

### Sprint P1 — Graph + Health (3 Wochen)
- D11: `src/core/graph.ts` + Auto-Population in `log_interaction` + `get_relationship_graph` MCP-Tool
- D12: `src/core/relationship-health.ts` + `get_relationship_health` MCP-Tool
- Tests: graph.test.ts, relationship-health.test.ts
- CLI: Kein neuer Command — Tools werden über MCP aufgerufen

### Sprint P2 — Revenue Intelligence (3 Wochen)
- D14: `src/core/revenue-simulation.ts` + `simulate_revenue` MCP-Tool
- D18: `src/sync/external-signals.ts` (News + Crunchbase Basic, kein Clearbit-Zwang)
- D18: `get_org_intelligence` MCP-Tool + `get_stakeholder_map`
- Tests: revenue-simulation.test.ts, external-signals.test.ts, org-intelligence.test.ts

### Sprint P3 — Autonomous Agents (4 Wochen)
- D13: `src/agents/deal-agent.ts` + `run_deal_agent` + `approve_agent_action` MCP-Tools
- D15: `src/core/playbook-engine.ts` + Playbook-MCP-Tools
- D19: `src/agents/deal-room.ts` + `open_deal_room` MCP-Tool
- Tests: deal-agent.test.ts, playbook-engine.test.ts, deal-room.test.ts

### Sprint P4 — Proactive + Push (3 Wochen)
- D17: `src/sync/push-manager.ts` + Push CLI + Webhook-Endpunkte
- D20: `src/daemon/proactive-worker.ts` + `get_proactive_briefing` MCP-Tool
- D16: `src/core/goal-engine.ts` + `pursue_goal` + `dxcrm goal` CLI
- Tests: push-manager.test.ts, proactive-worker.test.ts, goal-engine.test.ts

### Sprint P5 — Harness-Update + E2E + Docs (2 Wochen)
- Alle Harness-Files updaten (CLAUDE.md, AGENTS.md, SOUL.md, GEMINI.md, etc.)
- E2E-Tests: proactive-workflow.test.ts, deal-room-workflow.test.ts
- docs/index.html v3 + README v2
- `npm run build && npm run typecheck && npm test` → alles grün → merge main

---

## Kill Conditions (unverändert von v1)

| Kondition | Reaktion |
|---|---|
| `npm test` schlägt fehl | Kein Commit |
| `npm run build` schlägt fehl | Kein Commit |
| External Dependency mit >10MB | Ablehnen — alternatives Implementation |
| Breaking Change in MCP-Tool-API | Minor Version Bump + Migration Guide |
| Graph-Memory > 100MB für Standardkunde | In-Process Graph durch SQLite-vec ersetzen |

---

## EU AI Act Compliance (ab August 2026)

Die Research warnt: *"CRM agents touching employment screening, credit-adjacent scoring, or biometric inference fall into Annex III scope."*

Unsere Maßnahmen:

| Anforderung | Implementierung |
|---|---|
| Inspektierbare Traces | Jede `run_deal_agent`-Antwort enthält `trace`-Objekt |
| Human Oversight | `autonomyLevel: "suggest"` ist Default — `"act"` muss explizit gesetzt werden |
| Audit Trail | v1 `audit.log` deckt alle Writes ab (bereits vorhanden) |
| GDPR Erasure | v1 `dxcrm gdpr erase` deckt alle Daten inkl. `graph.json` (erweiterbar) |
| Data Minimization | Externe Signale nur wenn explizit aktiviert (`dxcrm push register --provider ...`) |
| Transparenz zu Extern | Wenn Proactive Agent E-Mails sendet: Footer mit "AI-assisted" Disclosure |
| Technische Dokumentation | `dxcrm security-report` bekommt v2-Sektion für agentic compliance |

---

## Positionierung gegen die Konkurrenz

| Competitor | Preis | AI-Native | Lokal | MCP | Autonomie | Open Source |
|---|---|---|---|---|---|---|
| Salesforce Agentforce | €150+/User/Mo | Retrofit | Nein | Ja (2025) | Ja (enterprise) | Nein |
| HubSpot Breeze | €90+/User/Mo | Retrofit | Nein | Ja | Eingeschränkt | Nein |
| Attio | €59/User/Mo | Ja | Nein | Nein | Nein | Nein |
| Day.ai | $30+/User/Mo | Ja | Nein | Nein | Nein | Nein |
| Clay | $149+/Mo | Ja | Nein | Nein | Partial | Nein |
| **dxcrm v2** | **€0** | **Ja** | **Ja** | **Ja (27 Tools)** | **Ja (configurable)** | **Ja** |

Der Moat ist nicht eine einzelne Funktion. Der Moat ist: **das einzige agentic CRM das du in 5 Minuten installierst, lokal besitzt, in jedem Framework nutzt, und das sich selbst mit deinen eigenen Daten verbessert.**

---

## Erfolgsmetrik

**v2 ist fertig wenn:**

1. `npm install -g datasynx-opencrm` + `dxcrm init` + `dxcrm create "Acme Corp"` → in 5 Minuten läuft `get_proactive_briefing()` und gibt echte Insights.
2. Ein Deal der in v1 2 Wochen stagniert hätte, wird in v2 innerhalb 24h von `relationship_decay_alert` erkannt und als Task in die Queue gestellt.
3. `open_deal_room` gibt in < 5 Sekunden einen vollständigen Brief der alle 7 Intelligence-Layer vereint.
4. `pursue_goal("Close €500k this quarter")` gibt einen Dekompositions-Plan der sich am Ende des Quartals als kalibriert erweist (P50 ±20%).
5. Alle 27 MCP-Tools haben 100% Test-Coverage auf dem kritischen Pfad. Gesamte Test-Suite: > 1.200 Tests.

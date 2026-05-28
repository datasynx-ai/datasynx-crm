# MCP Tools Reference — datasynx-opencrm

All tools are registered via `server.registerTool()` (MCP SDK v1.x).
Server name: `datasynx-opencrm`
Tool prefix in Claude Code: `mcp__datasynx-opencrm__`

---

## get_capabilities

Returns full capability description and CRM workflow guide.

```json
// Input
{}

// Output
{
  "capabilities": "<full markdown guide>"
}
```

---

## get_customer_context

Returns complete customer brief: profile, last 10 interactions, pipeline deals.

```json
// Input
{ "slug": "acme-corp" }

// Output
{
  "context": "# Acme Corp\n...",
  "slug": "acme-corp",
  "found": true
}
```

---

## search_customer_knowledge

Semantic search through customer interaction history.

```json
// Input
{ "slug": "acme-corp", "query": "pricing negotiation", "limit": 5 }

// Output
{
  "results": [
    { "content": "...", "score": 0.92, "source": "gmail://thread/abc123" }
  ]
}
```

---

## list_customers

List all customers with stage and deal value.

```json
// Input
{ "filter": "acme" }   // optional substring filter

// Output
{
  "customers": [
    {
      "slug": "acme-corp",
      "name": "Acme Corp",
      "stage": "active",
      "dealValue": 50000,
      "lastInteraction": "2026-05-20"
    }
  ]
}
```

---

## log_interaction

Record a call, email, meeting, or note.

```json
// Input
{
  "slug": "acme-corp",
  "type": "Call",            // Email|Call|Meeting|Note|Demo|Proposal|Contract|Other
  "summary": "Discussed Q3 renewal. Budget confirmed at €50k.",
  "with": "Max Müller",
  "nextSteps": ["Send proposal by Friday", "Schedule follow-up"],
  "direction": "outbound",   // optional: inbound|outbound
  "source": "manual"         // optional
}

// Output
{ "success": true, "path": "./customers/acme-corp/interactions.md", "entry": "..." }
```

---

## update_deal

Update a pipeline deal.

```json
// Input
{
  "slug": "acme-corp",
  "dealName": "Q3 Renewal",
  "stage": "negotiation",    // lead|qualified|proposal|negotiation|won|lost
  "value": 50000,
  "probability": 75,
  "closeDate": "2026-08-31",
  "notes": "Budget confirmed"
}

// Output
{ "success": true, "deal": { "name": "Q3 Renewal", "stage": "negotiation", ... } }
```

---

## update_customer_facts

Update fields in a customer's `main_facts.md` profile. Merges patch into existing data; sets `updated` to today.

```json
// Input
{
  "slug": "acme-corp",
  "domain": "new-acme.com",          // optional — any combination of fields
  "primaryContact": "Bob Jones",
  "relationshipStage": "active",     // prospect|active|churned|paused
  "tags": ["enterprise", "pilot"],
  "phone": "+1 555 0100",
  "industry": "SaaS"
}

// Output
{ "success": true, "facts": { "name": "Acme Corp", "domain": "new-acme.com", ... } }
```

**RBAC**: requires `admin` role (or above).
**Audit**: writes entry to `.agentic/audit.log`.

---

## export_customer

Export customer data.

```json
// Input
{ "slug": "acme-corp", "format": "json" }  // json|markdown

// Output (json)
{
  "slug": "acme-corp",
  "facts": { ... },
  "interactionsCount": 42,
  "pipeline": [ ... ],
  "exportedAt": "2026-05-25T..."
}
```

---

## get_active_session

Returns the current active customer session.

```json
// Input
{}

// Output
{
  "hasSession": true,
  "customerSlug": "acme-corp",
  "customerName": "Acme Corp",
  "startedAt": "2026-05-25T10:00:00.000Z"
}
```

---

## get_deal_health

Score all deals for a customer on a 0–100 scale with letter grades (A–F).

```json
// Input
{ "slug": "acme-corp" }

// Output
{
  "deals": [
    {
      "name": "Enterprise License 2026",
      "stage": "negotiation",
      "value": 75000,
      "score": 82,
      "grade": "B",
      "warnings": ["No interaction in 14 days", "Close date approaching"]
    }
  ]
}
```

Scoring signals: recency of last interaction, days to close date, stage progression, probability alignment. Grade map: A ≥90, B ≥75, C ≥60, D ≥40, F <40.

---

## get_pipeline_forecast

Aggregate weighted pipeline revenue across all customers grouped by stage.

```json
// Input
{}

// Output
{
  "total": 347500,
  "weighted": 189250,
  "byStage": {
    "lead":        { "count": 3, "raw": 45000,  "weighted": 4500  },
    "qualified":   { "count": 2, "raw": 80000,  "weighted": 24000 },
    "proposal":    { "count": 4, "raw": 120000, "weighted": 60000 },
    "negotiation": { "count": 2, "raw": 75000,  "weighted": 56250 },
    "won":         { "count": 1, "raw": 27500,  "weighted": 27500 }
  }
}
```

---

## summarize_meeting

Summarize a meeting transcript via LLM and log the interaction automatically.

```json
// Input
{
  "slug": "acme-corp",
  "transcript": "Alice: Thanks for joining. We discussed the Q3 renewal...",
  "with": "Alice Smith",
  "date": "2026-05-27"     // optional, defaults to today
}

// Output
{
  "success": true,
  "summary": "Discussed Q3 renewal pricing. Budget confirmed at €75k.",
  "nextSteps": ["Send updated proposal", "Loop in legal by EOW"],
  "interactionLogged": true
}
```

Requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in environment.

---

## get_pipeline_stages

Return all configured pipeline stages.

```json
// Input
{}

// Output
{
  "stages": [
    { "id": "lead",        "label": "Lead",        "order": 1, "probability": 10, "color": "#8b949e" },
    { "id": "qualified",   "label": "Qualified",   "order": 2, "probability": 30, "color": "#58a6ff" },
    { "id": "proposal",    "label": "Proposal",    "order": 3, "probability": 50, "color": "#d29922" },
    { "id": "negotiation", "label": "Negotiation", "order": 4, "probability": 75, "color": "#ffa657" },
    { "id": "won",         "label": "Won",         "order": 5, "probability": 100,"color": "#3fb950", "final": true },
    { "id": "lost",        "label": "Lost",        "order": 6, "probability": 0,  "color": "#f85149", "final": true }
  ]
}
```

Custom stages configured via `dxcrm stages set|delete|reset`.

---

## get_market_intelligence

Search interaction history across **all** customers for a pattern or topic.

```json
// Input
{
  "query": "pricing objection competitor mention",
  "limit": 10    // optional, default 10
}

// Output
{
  "results": [
    {
      "customer": "acme-corp",
      "content": "Mentioned Salesforce pricing was too high...",
      "score": 0.91,
      "source": "gmail://thread/abc"
    },
    {
      "customer": "beta-gmbh",
      "content": "Asked for comparison vs HubSpot...",
      "score": 0.87,
      "source": "interactions://2026-05-10"
    }
  ]
}
```

Useful for identifying cross-customer patterns, objection trends, and competitor mentions.

---

## get_relationship_health

Returns health scores for all contacts of a customer. Scores decay automatically when
communication cadence breaks — no manual input required.

```json
// Input
{ "slug": "acme-corp" }

// Output
{
  "slug": "acme-corp",
  "overallHealth": 58,
  "updatedAt": "2026-05-27T14:00:00.000Z",
  "atRiskContacts": ["cfo@acme.com"],
  "coldContacts": ["cfo@acme.com"],
  "contacts": [
    {
      "contactId": "person:max@acme.com",
      "name": "Max Müller",
      "email": "max@acme.com",
      "score": 72,
      "grade": "B",
      "trend": "stable",
      "daysSinceContact": 5,
      "avgCadenceDays": 7,
      "sentimentTrend": 0,
      "riskFlags": [],
      "lastContact": "2026-05-22",
      "interactionCount30d": 4,
      "recommendation": "Max Müller — grade B. Next contact due in ~2 days."
    },
    {
      "contactId": "person:cfo@acme.com",
      "name": "Thomas Berger",
      "email": "cfo@acme.com",
      "score": 18,
      "grade": "F",
      "trend": "cold",
      "daysSinceContact": 32,
      "avgCadenceDays": 14,
      "sentimentTrend": 0,
      "riskFlags": ["NO_CONTACT_30D", "CHAMPION_SILENT"],
      "lastContact": "2026-04-25",
      "interactionCount30d": 0,
      "recommendation": "Re-engage Thomas Berger urgently — no contact in 32 days."
    }
  ]
}
```

**Score formula:** Recency (35%) · Cadence (25%) · Sentiment (20%, v1=neutral) · Response latency (10%, v1=neutral) · Momentum (10%)

**Grades:** A ≥ 80 · B ≥ 60 · C ≥ 40 · D ≥ 20 · F < 20

**Risk flags:** `NO_CONTACT_14D`, `NO_CONTACT_30D`, `CHAMPION_SILENT`

Health auto-updates after every `log_interaction`. Recomputes if stale (>1h).

---

## get_relationship_graph

Returns the knowledge graph for a customer: contacts, companies, and their relationships.
Auto-populated from every `log_interaction` call — no setup required.

```json
// Input
{
  "slug": "acme-corp"
}

// Output
{
  "slug": "acme-corp",
  "nodeCount": 4,
  "edgeCount": 3,
  "updatedAt": "2026-05-27T14:00:00.000Z",
  "stakeholders": {
    "champions": [
      { "id": "person:alice@acme.com", "name": "Alice Müller", "email": "alice@acme.com" }
    ],
    "blockers": [],
    "economicBuyers": [
      { "id": "person:cfo@acme.com", "name": "Thomas Berger", "email": "cfo@acme.com" }
    ],
    "allContacts": [
      { "id": "person:alice@acme.com", "name": "Alice Müller", "email": "alice@acme.com" },
      { "id": "person:cfo@acme.com",   "name": "Thomas Berger", "email": "cfo@acme.com" }
    ],
    "missingRoles": []
  },
  "nodes": [ /* full GraphNode[] */ ],
  "edges": [ /* full GraphEdge[] */ ]
}
```

`missingRoles` signals gaps in stakeholder coverage:

```json
"missingRoles": [
  { "role": "champion",       "urgency": "important", "suggestion": "Identify who is driving this deal internally." },
  { "role": "economic_buyer", "urgency": "critical",  "suggestion": "Find out who signs the contract. Ask your champion directly." }
]
```

Node IDs are deterministic:
- Person with email: `"person:alice@acme.com"`
- Person without email: `"person:acme-corp:alice-muller"`
- Company with domain: `"company:acme.com"`
- Company without domain: `"company:acme-corp"`

Edge types: `WORKS_AT`, `IS_CHAMPION`, `IS_BLOCKER`, `IS_ECONOMIC_BUYER`, `KNOWS`, `INTRODUCED_BY`, `OWNS_DEAL`, `COMPETES_WITH`

Edge weight increases by 0.05 with each interaction (capped at 1.0). Use `setNodeRole` via direct API to assign champion/blocker/economic_buyer roles.

---

## run_deal_agent

Analyze a specific deal and generate a prioritized action plan. Supports three autonomy levels.

```json
// Input
{
  "slug": "acme-corp",
  "dealName": "Q3 Renewal",
  "autonomyLevel": "suggest",    // observe|suggest|act (default: suggest)
  "instruction": "Focus on close date risk",  // optional
  "valueThreshold": 50000        // optional: EUR above which no auto-execution
}

// Output
{
  "slug": "acme-corp",
  "dealName": "Q3 Renewal",
  "assessment": "Deal is in negotiation with close date approaching...",
  "riskLevel": "medium",
  "plan": [
    { "step": 1, "action": "Send final proposal", "priority": "high", "reason": "Close date in 19 days" }
  ],
  "actionsQueued": [
    {
      "actionId": "da_1748346900000_a3f7x2",
      "type": "log_interaction",
      "payload": { "slug": "acme-corp", "type": "Note", "summary": "...", "with": "Max Müller" },
      "confidence": 0.85,
      "reasoning": "Champion identified, close date approaching",
      "requiresHumanApproval": true,
      "status": "pending",
      "createdAt": "2026-05-27T14:00:00.000Z"
    }
  ],
  "actionsExecuted": [],
  "trace": {
    "timestamp": "2026-05-27T14:00:00.000Z",
    "autonomyLevel": "suggest",
    "observation": "Deal: Q3 Renewal | Stage: negotiation ...",
    "plan": ["1. Send final proposal [high]"],
    "actionsConsidered": [...],
    "actionTaken": null,
    "outcome": "queued"
  }
}
```

**Autonomy levels:**
- `observe` — read-only analysis, no side effects
- `suggest` (default) — queues actions in `agent-queue.json` for human review
- `act` — auto-executes actions with `confidence ≥ 0.7` and `value < valueThreshold`

**Signals analyzed:** deal health score, relationship health, stakeholder gaps, recent interactions.
**LLM fallback:** rule-based analysis when no API key or LLM fails.

---

## approve_agent_action

Approve or reject a pending action from the deal agent queue.

```json
// Input
{
  "slug": "acme-corp",
  "actionId": "da_1748346900000_a3f7x2",
  "approved": true    // true to execute, false to reject
}

// Output (approved)
{ "success": true, "actionId": "da_1748346900000_a3f7x2", "status": "executed" }

// Output (rejected)
{ "success": true, "actionId": "da_1748346900000_a3f7x2", "status": "rejected" }

// Output (not found)
{ "success": false, "error": "Action da_... not found in queue" }
```

Find `actionId` in `run_deal_agent` response `.actionsQueued[].actionId`.
Queue is persisted at `customers/<slug>/agent-queue.json`.

---

## simulate_revenue

Monte Carlo pipeline revenue simulation with P10/P50/P90 confidence intervals.
Adjusts deal win probabilities using relationship health (D12) and champion presence (D11).

```json
// Input
{
  "horizon": "quarter",   // "quarter" (default) | "year"
  "iterations": 10000     // optional, default 10000
}

// Output
{
  "forecast": {
    "p10": 145000,
    "p50": 287500,
    "p90": 412000,
    "expected": 289300,
    "stdDev": 82000,
    "atRiskRevenue": 75000,
    "byCloseMonth": {
      "2026-06": { "p50": 120000, "range": [80000, 165000] },
      "2026-07": { "p50": 167500, "range": [90000, 247000] }
    },
    "topRisks": [
      "acme-corp/Enterprise License: health 38, champion silent — €75k at risk"
    ],
    "sensitivityMap": {
      "Enterprise License": 56250,
      "Q3 Renewal": 37500
    }
  },
  "confidence": "P50 forecast: €287.5k with ±€133.5k uncertainty (P10–P90 range). 28% of pipeline is at risk. 5 deals simulated.",
  "dealCount": 5,
  "horizon": "quarter",
  "simulatedAt": "2026-05-27T14:00:00.000Z"
}
```

**Probability adjustment:** Base probability + health adjustment (health 60 = neutral, ±0.2 range) + champion bonus (+5%).

**atRiskRevenue:** Sum of values for all deals with health score < 60.

**sensitivityMap:** Expected contribution per deal (`value × adjustedProbability`). Sort descending to find which deal matters most.

**topRisks:** Top 5 at-risk deals (health < 60 or 14+ days no contact), sorted by sensitivity.

---

### get_playbook

Retrieve playbooks matching the current deal situation. Without deal context, returns all playbooks for the customer. Sorted by success rate (highest first).

```json
// Without deal context — returns all playbooks
get_playbook({ "slug": "acme-corp" })

// With deal context — trigger matching
get_playbook({
  "slug": "acme-corp",
  "stage": "negotiation",
  "value": 75000,
  "daysSinceContact": 10,
  "healthScore": 55,
  "championPresent": false
})

// Output
{
  "matches": [
    {
      "name": "enterprise-renewal",
      "score": 1.0,
      "trigger": "deal_stage_negotiation AND value > 50000 AND days_stalled > 7",
      "successRate": 0.73,
      "usedCount": 8,
      "content": "# Enterprise Renewal\n\n## Steps\n1. Call economic buyer directly."
    }
  ],
  "totalPlaybooks": 3,
  "slug": "acme-corp"
}
```

**Trigger DSL:** AND-only conditions. Supported tokens: `deal_stage_<stage>`, `value > N`, `value < N`, `days_stalled > N`, `days_stalled < N`, `health < N`, `health > N`, `no_champion`, `has_champion`. Only exact matches (score = 1.0) are returned.

---

### create_playbook

Create or update a playbook encoding proven tactics for a specific deal situation.

```json
create_playbook({
  "slug": "acme-corp",
  "name": "enterprise-renewal",
  "trigger": "deal_stage_negotiation AND value > 50000 AND days_stalled > 7",
  "content": "# Enterprise Renewal\n\n## Situation\nDeal stalled in negotiation...\n\n## Steps\n1. Call economic buyer directly.\n2. Send ROI analysis.",
  "successRate": 0.73
})

// Output
{
  "success": true,
  "playbook": {
    "name": "enterprise-renewal",
    "trigger": "deal_stage_negotiation AND value > 50000 AND days_stalled > 7",
    "successRate": 0.73,
    "path": "/path/to/customers/acme-corp/playbooks/enterprise-renewal.md"
  }
}
```

Stored at `customers/<slug>/playbooks/<kebab-name>.md` with YAML frontmatter. Upserts by name (overwrites if exists). Default `successRate: 0.5`.

---

### list_playbooks

List all playbooks for a customer (metadata only — no body content for performance).

```json
list_playbooks({ "slug": "acme-corp" })

// Output
{
  "playbooks": [
    {
      "name": "enterprise-renewal",
      "trigger": "deal_stage_negotiation AND value > 50000",
      "successRate": 0.73,
      "usedCount": 8,
      "lastUpdated": "2026-05-20"
    }
  ],
  "count": 1,
  "slug": "acme-corp"
}
```

---

### distill_playbook

Use LLM to extract a reusable playbook from a won or lost deal's interaction history. Analyzes `interactions.md` and identifies the winning/losing pattern as a structured playbook. Run after every won or lost deal to build procedural memory.

```json
distill_playbook({
  "slug": "acme-corp",
  "dealName": "Q3 Enterprise License",
  "outcome": "won"
})

// Output
{
  "success": true,
  "playbook": {
    "name": "enterprise-q3-renewal",
    "trigger": "deal_stage_negotiation AND value > 50000",
    "successRate": 1.0,
    "path": "/path/to/customers/acme-corp/playbooks/enterprise-q3-renewal.md"
  },
  "reasoning": "Deal won by leading with ROI framing early in negotiation. Champion was CEO."
}
```

**Fallback successRate:** `won` → 1.0, `lost` → 0.0 when LLM doesn't return a numeric value.

**Error cases:** `{ success: false, error: "No interactions.md found for <slug>" }` or `{ success: false, error: "LLM response could not be parsed as playbook" }`.

---

### pursue_goal

Set a revenue or pipeline goal and get an AI-decomposed action plan. Analyzes current pipeline P50 via Monte Carlo simulation (D14), calculates the gap, and ranks deals by weighted leverage. Persists goal to `.agentic/goals.json`. RBAC: manager+.

```json
pursue_goal({
  "goal": "Close €500k ARR this quarter",
  "deadline": "2026-09-30",
  "context": "Focus on existing pipeline, no new prospecting"
})

// Output
{
  "goalId": "goal_1748697600000_a3f7x2",
  "description": "Close €500k ARR this quarter",
  "target": 500000,
  "deadline": "2026-09-30",
  "type": "revenue",
  "decomposition": {
    "analysis": "Current pipeline P50: €287k. Gap to target: €213k. Top 3 deal(s) identified.",
    "currentPipeline": 287000,
    "gap": 213000,
    "subGoals": [
      {
        "priority": 1,
        "action": "Accelerate acme-corp/Enterprise License",
        "slug": "acme-corp",
        "dealName": "Enterprise License",
        "why": "€75k deal in negotiation — health 42/100",
        "nextStep": "Schedule an urgent check-in call",
        "targetDelta": 75000,
        "playbookName": "enterprise-renewal"
      }
    ],
    "probabilisticOutcome": "If all recommended deals close: ~€512k (target: €500k)."
  }
}
```

**Goal types auto-inferred from description:** `revenue` (close/ARR/MRR), `pipeline` (prospect/lead), `relationship` (meeting/call), `churn_prevention` (retain/renewal).

**Target parsing:** supports `€500k`, `$2M`, `€1.5 million`, `500000`. Returns 0 if no number found.

---

### get_goal_status

Get all active goals or a specific goal. Returns progress, days remaining, and top sub-goals.

```json
// All active goals
get_goal_status()

// Specific goal
get_goal_status({ "goalId": "goal_1748697600000_a3f7x2" })

// Output
{
  "goals": [
    {
      "id": "goal_1748697600000_a3f7x2",
      "description": "Close €500k ARR this quarter",
      "target": 500000,
      "progress": 45,
      "status": "active",
      "deadline": "2026-09-30",
      "daysRemaining": 125,
      "subGoals": [...],
      "createdAt": "2026-05-27T..."
    }
  ],
  "activeCount": 1,
  "completedCount": 0
}
```

**CLI equivalent:** `dxcrm goal status` / `dxcrm goal set "..." --deadline YYYY-MM-DD` / `dxcrm goal update <id> --progress N` / `dxcrm goal cancel <id>`.

---

## D17 — Real-Time Push Ingestion

### `register_push_subscription`

Register a real-time push subscription so providers send events directly to dxcrm (no polling). Gmail Pub/Sub, Microsoft Graph webhooks, and Slack Events API are supported.

**RBAC:** admin only

**Input:**
```json
{
  "provider": "gmail",
  "slug": "acme-corp",
  "webhookUrl": "https://myserver.com/webhooks/gmail",
  "gmailTopicName": "projects/my-project/topics/gmail-push"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `provider` | `"gmail" \| "microsoft-graph" \| "slack"` | ✅ | Push provider |
| `slug` | string | ✅ | Customer slug |
| `webhookUrl` | string | ✅ | Public HTTPS URL for provider callbacks |
| `gmailTopicName` | string | Gmail only | Cloud Pub/Sub topic name |
| `microsoftClientState` | string | MS Graph | HMAC verification secret |
| `microsoftResource` | string | MS Graph | Resource path (e.g. `/me/mailFolders/Inbox/messages`) |
| `slackTeamId` | string | Slack | Workspace team ID |
| `slackChannelId` | string | Slack | Optional specific channel to monitor |

**Output:**
```json
{
  "subscriptionId": "psub_1716892800_a1b2c3",
  "provider": "gmail",
  "slug": "acme-corp",
  "status": "active",
  "expiresAt": "2026-06-04T06:00:00.000Z",
  "createdAt": "2026-05-28T06:00:00.000Z"
}
```

> **Note:** Gmail subscriptions expire after 7 days, MS Graph after 3 days. The daemon auto-renews them daily at 06:00.

**Webhook endpoints exposed by `dxcrm server start`:**
- `POST /webhooks/gmail` — Gmail Pub/Sub callbacks
- `ALL /webhooks/microsoft` — MS Graph webhooks (GET for validation handshake)
- `POST /webhooks/slack` — Slack Events API (POST for url_verification + events)

**CLI equivalent:** `dxcrm push register <slug> --provider gmail --webhook-url <url> --topic-name <topic>`

---

### `get_push_status`

Get the status of all active push subscriptions.

**RBAC:** any

**Input:**
```json
{
  "slug": "acme-corp",
  "provider": "gmail"
}
```
All fields are optional. Omit both to return all subscriptions.

**Output:**
```json
{
  "subscriptions": [
    {
      "id": "psub_1716892800_a1b2c3",
      "provider": "gmail",
      "slug": "acme-corp",
      "status": "active",
      "expiresAt": "2026-06-04T06:00:00.000Z",
      "expiresInHours": 162,
      "needsRenewal": false,
      "lastEventAt": "2026-05-28T09:45:00.000Z",
      "eventsProcessed": 47,
      "webhookUrl": "https://myserver.com/webhooks/gmail"
    }
  ],
  "summary": {
    "total": 3,
    "active": 2,
    "expiringSoon": 0,
    "expired": 1
  }
}
```

`needsRenewal: true` when `expiresInHours < 24`.

**CLI equivalent:** `dxcrm push status [--slug <slug>] [--provider <provider>]`

---

### `get_org_intelligence`

Build a stakeholder map combining the relationship graph, contact health scores, risk flags, and missing-role detection into a single brief.

**Input**
| Field | Type | Required | Description |
|---|---|---|---|
| slug | string | ✓ | Customer slug |
| dealName | string | — | Optional: scope analysis to a specific deal |

**Output**
```json
{
  "slug": "acme-corp",
  "dealName": "Enterprise License",
  "updatedAt": "2026-05-28T00:00:00.000Z",
  "people": [
    {
      "name": "Max Müller",
      "email": "max@acme.com",
      "role": "champion",
      "healthScore": 85,
      "daysSinceContact": 8,
      "contactStrength": 0.9,
      "riskFlags": []
    },
    {
      "name": "Sarah Schmidt",
      "email": "sarah@acme.com",
      "role": "unknown",
      "healthScore": 15,
      "daysSinceContact": 45,
      "contactStrength": 0.5,
      "riskFlags": ["NO_CONTACT_14D", "NO_CONTACT_30D"]
    }
  ],
  "missingRoles": [
    {
      "role": "economic_buyer",
      "urgency": "critical",
      "suggestion": "Find out who signs the contract. Ask your champion directly."
    }
  ],
  "riskAssessment": "Economic buyer unknown — decision authority not confirmed. Cold contacts (30d+ silence): Sarah Schmidt.",
  "recommendation": "Find out who signs the contract. Ask your champion directly."
}
```

**Roles**: `champion`, `economic_buyer`, `blocker`, `influencer`, `user`, `unknown`

**CLI equivalent:** `dxcrm org-intel <slug> [--deal <dealName>]`

---

### `open_deal_room`

Multi-agent deal brief: orchestrates 6 sub-systems in parallel (stakeholder map, relationship health, deal health, Monte Carlo simulation, playbook matching, executive synthesis) and returns a unified brief with risk score and prioritised action list.

**Input**
| Field | Type | Required | Description |
|---|---|---|---|
| slug | string | ✓ | Customer slug |
| dealName | string | ✓ | Name of the deal to analyse |

**Output**
```json
{
  "slug": "acme-corp",
  "dealName": "Enterprise License 2026",
  "generatedAt": "2026-05-28T14:30:00.000Z",
  "stakeholders": { "...": "StakeholderMap (see get_org_intelligence)" },
  "relationshipHealth": [ "...ContactHealth objects..." ],
  "dealHealth": [
    { "deal": "Enterprise License 2026", "stage": "proposal", "score": 72, "grade": "B", "warnings": [] }
  ],
  "revenueSimulation": { "p50": 287000, "p10": 140000, "p90": 412000, "expected": 281000, "atRiskRevenue": 0 },
  "recommendedPlaybook": null,
  "executiveSummary": "acme-corp/Enterprise License 2026: relationship health 72/100, 1 champion(s) identified. Critical gaps: 1 key role(s) unidentified — risk score 30/100.",
  "topPriorities": [
    "Find out who signs the contract. Ask your champion directly.",
    "Maintain current momentum — schedule next check-in."
  ],
  "riskScore": 30
}
```

`riskScore` 0–100: derived from missing critical roles (+25 each), average deal health, and relationship health.

**CLI equivalent:** `dxcrm deal-room <slug> <dealName>`

---

### `get_proactive_briefing`

Generate a proactive daily briefing scanning all customers for relationship decay, imminent close dates, overdue deals, and expansion opportunities. Returns urgent alerts, an opportunity list, a P50/P90 forecast, and a single top-action recommendation.

**Input**
| Field | Type | Required | Description |
|---|---|---|---|
| date | string | — | ISO date `YYYY-MM-DD`. Defaults to today. |

**Output**
```json
{
  "date": "2026-05-28",
  "generatedAt": "2026-05-28T07:00:00.000Z",
  "urgent": [
    "acme-corp: Sarah Schmidt has been silent for 45 days — health 15/100",
    "beta-gmbh: Deal \"Enterprise Q2\" closes in 3 day(s) — negotiation"
  ],
  "opportunities": [
    "gamma-ag: relationship health 82/100 with 2 active deal(s) — good time for expansion or upsell."
  ],
  "forecast": "Q forecast: P50 €287.0k / P90 €412.0k — 5 deal(s) in pipeline.",
  "topAction": "Sarah Schmidt has been silent for 45 days"
}
```

**Alert triggers**
- `urgent`: `NO_CONTACT_30D` flag on any contact, or deal close date within 7 days, or overdue close date
- `opportunities`: customer with relationship health ≥ 65 and active pipeline

**CLI equivalent:** `dxcrm briefing [--date YYYY-MM-DD]`

---

## Recommended Workflow

```
Morning briefing:    get_proactive_briefing()
List customers:      list_customers()
Before any call:     get_customer_context(slug)
After call/email:    log_interaction(slug, type, summary, nextSteps)
After meeting:       summarize_meeting(slug, transcript, with)
After deal update:   update_deal(slug, dealName, { stage, value })
Deal health check:   get_deal_health(slug)
Relationship health: get_relationship_health(slug)
Stakeholder map:     get_org_intelligence(slug)
Full deal brief:     open_deal_room(slug, dealName)
Revenue forecast:    get_pipeline_forecast()
Market patterns:     get_market_intelligence(query)
Historical search:   search_customer_knowledge(slug, query)
Deal agent analysis: run_deal_agent(slug, dealName, { autonomyLevel: "suggest" })
Approve action:      approve_agent_action(slug, actionId, { approved: true })
Revenue simulation:  simulate_revenue({ horizon: "quarter" })
Playbook lookup:     get_playbook(slug, { stage, value, daysSinceContact })
Playbook create:     create_playbook(slug, name, trigger, content)
After won/lost deal: distill_playbook(slug, dealName, outcome)
Set quarterly goal:  pursue_goal(goal, deadline)
Check goal progress: get_goal_status()
Enable real-time:    register_push_subscription(provider, slug, webhookUrl)
Push sub status:     get_push_status()
Unsure what to use:  get_capabilities()
```

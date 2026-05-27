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

## Recommended Workflow

```
Morning briefing:    list_customers()
Before any call:     get_customer_context(slug)
After call/email:    log_interaction(slug, type, summary, nextSteps)
After meeting:       summarize_meeting(slug, transcript, with)
After deal update:   update_deal(slug, dealName, { stage, value })
Deal health check:   get_deal_health(slug)
Revenue forecast:    get_pipeline_forecast()
Market patterns:     get_market_intelligence(query)
Historical search:   search_customer_knowledge(slug, query)
Unsure what to use:  get_capabilities()
```

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

## Recommended Workflow

```
Morning briefing:    list_customers()
Before any call:     get_customer_context(slug)
After call/email:    log_interaction(slug, type, summary, nextSteps)
After deal update:   update_deal(slug, dealName, { stage, value })
Historical search:   search_customer_knowledge(slug, query)
Unsure what to use:  get_capabilities()
```

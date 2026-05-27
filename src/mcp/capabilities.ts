// src/mcp/capabilities.ts
// Single Source of Truth for capability documentation.
// Used by get_capabilities() MCP tool AND dxcrm guide CLI command.

export const CAPABILITIES_TEXT = `
# DatasynxOpenCRM — Agent Guide

## Product
DatasynxOpenCRM is a local-first, MCP-native CRM. All customer data lives in markdown
files on your machine. No cloud, no HubSpot, no per-seat pricing.

## Available Tools

| Tool | Purpose | When to Use |
|---|---|---|
| get_capabilities | Returns this guide | First call in a session |
| get_active_session | Check active customer session | Before assuming context |
| get_customer_context | Full briefing for a customer | Before any customer conversation |
| search_customer_knowledge | Semantic/FTS search across emails & transcripts | "What did they say about X?" |
| list_customers | List all customers with pipeline health | Morning briefing, pipeline overview |
| log_interaction | Write a new interaction entry | After every call/meeting/email |
| update_deal | Update deal stage, value, probability | After pipeline discussions |
| update_customer_facts | Update customer profile (domain, contact, stage, tags) | After learning new info |
| export_customer | Export all customer data as JSON or Markdown | Reporting, backup |
| get_deal_health | Score deal health (A–F grade, 0–100) | any |
| get_pipeline_forecast | Aggregate weighted pipeline revenue | any |
| summarize_meeting | Summarize transcript + log interaction | rep+ |

## Tool Reference

### get_capabilities()
Returns all available MCP tools, their inputs, and the CRM workflow guide.
- Input: none
- Returns: This guide text

### get_active_session()
Check which customer is currently active in the session store.
- Input: none
- Returns: { hasSession: boolean, customerSlug?, customerName?, startedAt? }

### get_customer_context({ slug })
Load complete briefing for a customer. Reads main_facts.md, last 10 interactions,
and pipeline deals. Returns a structured markdown context block.
- Input: { slug: string } — Customer ID (e.g. "acme-corp")
- Returns: Formatted markdown with Quick Reference, Contacts, Critical Context,
  Recent Activity, Pipeline, and Open Questions
- Performance: <3 seconds. Token budget: <3000 tokens.

### search_customer_knowledge({ slug, query, limit? })
Hybrid vector + full-text search across all emails and transcripts for a customer.
Searches the LanceDB docs table for the given customer.
- Input: { slug: string, query: string, limit?: number (default 5) }
- Returns: { results: Array<{ content, score, source }> }

### list_customers({ filter? })
List all customers with their stage, last interaction date, and deal value.
- Input: { filter?: string } — Optional substring filter on name or slug
- Returns: Array of { slug, name, stage, lastInteraction?, dealValue? }

### log_interaction({ slug, type, summary, with, nextSteps?, direction?, source? })
Write a new interaction entry to interactions.md. Immediately searchable.
Use after every call, meeting, or email.
- Input:
  slug: Customer ID
  type: "Email" | "Call" | "Meeting" | "Note" | "Demo" | "Proposal" | "Contract" | "Other"
  summary: 2-5 sentences describing what happened
  with: Who was involved (name or email)
  nextSteps?: Array of action items
  direction?: "inbound" | "outbound"
  source?: Source reference string
- Returns: { success: boolean, path: string, entry: string }

### update_deal({ slug, dealName, stage?, value?, probability?, closeDate?, notes? })
Update or create a deal in pipeline.md. Upserts by deal name.
- Input:
  slug: Customer ID
  dealName: Deal name (used as unique key)
  stage?: "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost"
  value?: Deal value in euros
  probability?: Win probability (0-100)
  closeDate?: Expected close date (YYYY-MM-DD)
  notes?: Free-text notes
- Returns: { success: boolean, deal: object }

### update_customer_facts({ slug, name?, domain?, email?, phone?, industry?, relationshipStage?, dealValue?, primaryContact?, timezone?, tags? })
Update fields in a customer's main_facts.md profile. Merges patch into existing data. Sets updated = today.
- Input: slug (required) + any combination of the optional fields
- Returns: { success: boolean, facts: object }

### export_customer({ slug, format? })
Export all customer data (main_facts + interactions count + pipeline).
- Input: { slug: string, format?: "json" | "markdown" (default "json") }
- Returns: Serialized customer data

## Recommended Workflow

1. User mentions a customer → **get_customer_context({ slug })**
2. Need historical info → **search_customer_knowledge({ slug, query })**
3. After a call/email/meeting → **log_interaction({ slug, type, summary, ... })**
4. Deal stage changed → **update_deal({ slug, dealName, stage, ... })**
5. Morning review → **list_customers()** for pipeline overview

## Data Structure

Customer data lives in \`customers/<slug>/\`:
- \`main_facts.md\` — YAML frontmatter + free-text sections
- \`interactions.md\` — Chronological log (newest first)
- \`pipeline.md\` — Deal table in Markdown
- \`sources.json\` — Gmail/transcript sync config per customer

## Response Format

Always cite sources (gmail://thread/... or file://...) when available.

## Framework Integration

| Framework | Tier | Config |
|---|---|---|
| Claude Code | 1 | CLAUDE.md + ~/.claude.json + .claude/settings.json |
| Codex CLI | 1 | AGENTS.md + ~/.codex/config.toml |
| Grok Build (xAI) | 1 | AGENTS.md + ~/.grok/user-settings.json + .grok/settings.json |
| OpenClaw | 1 | SOUL.md + AGENTS.md + TOOLS.md |
| Hermes Agent | 1 | SOUL.md + Skill |
| Antigravity CLI | 1 | GEMINI.md + AGENTS.md + SKILL.md |
| Cursor | 2 | .cursor/rules/datasynx-crm.mdc |
| Windsurf | 2 | MCP config only |
| Cline | 2 | MCP config only |
| Claude Desktop | 2 | MCP config only |

### Manual Grok Build configuration
\`\`\`json
// ~/.grok/user-settings.json  (mcpServers is an ARRAY in Grok, not a map)
{
  "mcpServers": [
    {
      "name": "datasynx-opencrm",
      "transport": {
        "type": "stdio",
        "command": "node",
        "args": ["/path/to/node_modules/datasynx-opencrm/dist/mcp.js"],
        "env": { "DXCRM_DATA_DIR": "~/.dxcrm" }
      }
    }
  ]
}
\`\`\`
Run \`grok inspect\` to verify the server is discovered.

## CLI Reference (Phase 2)

### dxcrm status
Show daemon status, customer count, sync ages, and unmatched transcript queue.
\`\`\`
dxcrm status
dxcrm status --unmatched   # list full unmatched transcript queue
\`\`\`

### dxcrm agent spawn <slug>
Spawn a wake-triggered agent for a customer. Sends Telegram notifications on new email.
\`\`\`
dxcrm agent spawn acme-corp --channel telegram
dxcrm agent spawn acme-corp --channel telegram --chat-id 12345
dxcrm agent status
dxcrm agent remove acme-corp
\`\`\`
Requires: \`TELEGRAM_BOT_TOKEN\` + \`TELEGRAM_CHAT_ID\` env vars.

### dxcrm import <path>
Import customers and interactions from HubSpot or generic CSV export.
\`\`\`
dxcrm import contacts.csv --from csv
dxcrm import hubspot-export.csv --from hubspot
dxcrm import hubspot-export.csv --from hubspot --dry-run
\`\`\`
- Two-pass: creates customers first, then imports activities
- Idempotent: re-running skips already-imported rows
- sourceRef format: \`hubspot://activity/<id>\` or \`csv://row/<hash>\`

## CLI Reference (Phase 3 — Team)

### dxcrm server start
Start a shared HTTP MCP server. Multiple team members connect via URL.
\`\`\`
dxcrm server start --data /mnt/crm-data --port 3847
dxcrm server status
\`\`\`
Set actor identity: \`export DXCRM_ACTOR=alice\`

### dxcrm audit
Show who changed what and when. Audit trail at \`.agentic/audit.log\`.
\`\`\`
dxcrm audit                       # Last 20 entries
dxcrm audit --slug acme-corp      # Filter by customer
dxcrm audit --actor alice         # Filter by actor
\`\`\`
Log format: \`2026-06-01T09:14:00Z | alice | log_interaction | acme-corp | summary\`

### session ownership
\`\`\`
dxcrm session open acme-corp --owner alice
# or: DXCRM_ACTOR=alice dxcrm session open acme-corp
\`\`\`
\`get_active_session()\` returns \`{ owner: "alice", ... }\` when owner is set.

## CLI Reference (Phase 5 — Migration)

### dxcrm import — Pipedrive API
\`\`\`
dxcrm import --from pipedrive --mode api --token <tok> --url https://myco.pipedrive.com
\`\`\`
Two-pass: persons → customers, activities → interactions.
sourceRef: \`pipedrive://activity/<id>\`

### update_customer_facts (new MCP tool)
Agents can now update customer profiles directly:
\`\`\`
update_customer_facts({ slug: "acme-corp", domain: "new-acme.com", primaryContact: "Bob" })
\`\`\`
Fields: name, domain, email, phone, industry, relationshipStage, dealValue, primaryContact, timezone, tags.
Restricted to admin role (RBAC). Writes audit log entry.

### CSV LLM Field Mapping
Generic CSV imports now use LLM-assisted column detection (fallback to heuristics when ANTHROPIC_API_KEY is unset).

## CLI Reference (Phase 4 — Enterprise)

### dxcrm rbac
Role-based access control. Roles: admin > manager > rep.
\`\`\`
dxcrm rbac set alice admin          # Assign role
dxcrm rbac show                     # List all roles
dxcrm rbac check alice update_deal  # Permission check
\`\`\`
Config: \`.agentic/rbac.json\` | Actor: \`DXCRM_ACTOR\` env var
Enforcement: per MCP tool call | Default role: rep

### dxcrm gdpr
GDPR erasure with dry-run safety and audit trail.
\`\`\`
dxcrm gdpr erase acme-corp           # Dry-run (shows plan)
dxcrm gdpr erase acme-corp --confirm # Permanent deletion
dxcrm gdpr list-erasures             # Erasure history
\`\`\`
On confirm: deletes customers/<slug>/, writes audit.log, appends gdpr-erasures.json

### dxcrm security-report
Generate Markdown security questionnaire for procurement/SOC2 review.
\`\`\`
dxcrm security-report
dxcrm security-report --output sec-report.md
\`\`\`

### Microsoft Outlook Sync
\`\`\`
dxcrm sync --provider microsoft
\`\`\`
Prerequisites: write \`.agentic/microsoft-token.json\` with \`{ "accessToken": "..." }\`
sourceRef: \`microsoft://message/<id>\` | API: Microsoft Graph v1.0

### Salesforce Import
\`\`\`
dxcrm import --from salesforce --mode api --token <tok> --url https://myco.salesforce.com
\`\`\`
Two-pass: contacts → customers, tasks → interactions (WhoId attribution)
sourceRef: \`salesforce://task/<id>\` | API: Salesforce REST v58.0
`.trim();

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
| get_pipeline_stages | List all configured pipeline stages | any |
| get_market_intelligence | Search across all customers for patterns | any |
| get_relationship_graph | Stakeholder map + knowledge graph for a customer | Before deal strategy |
| get_relationship_health | Health-Scores per contact, decay detection, recommendations | any |
| run_deal_agent | Analyze deal + generate action plan (observe/suggest/act) | rep+ |
| approve_agent_action | Approve/reject queued agent action | rep+ |
| simulate_revenue | Monte Carlo pipeline forecast (P10/P50/P90, sensitivity) | any |
| get_playbook | Retrieve matching playbooks for a deal situation | any |
| create_playbook | Create or update a playbook with trigger DSL | rep+ |
| list_playbooks | List all playbooks for a customer | any |
| distill_playbook | LLM-extract playbook from won/lost deal history | rep+ |
| pursue_goal | Set goal + get decomposed action plan (pipeline analysis) | manager+ |
| get_goal_status | Get active goals, progress, and sub-goal breakdown | any |
| register_push_subscription | Register real-time push subscription (Gmail/MS Graph/Slack) | admin |
| get_push_status | Show all push subscriptions, expiry, events processed | any |
| get_org_intelligence | Stakeholder map: champions, buyers, blockers, health scores, risk flags, recommendation | any |
| open_deal_room | Multi-agent deal brief: graph + health + deal health + simulation + playbook in one call | any |
| get_proactive_briefing | Daily briefing: urgent alerts, opportunities, P50/P90 forecast, top action | any |

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

### get_relationship_graph({ slug })
Returns the knowledge graph for a customer: contacts, companies, and their relationships.
Auto-populated from every log_interaction call. Shows stakeholder map with champions, blockers,
economic buyers, and gaps (missingRoles).
- Input: { slug: string }
- Returns: { nodeCount, edgeCount, stakeholders: { champions[], blockers[], economicBuyers[], allContacts[], missingRoles[] }, nodes[], edges[] }

### get_relationship_health({ slug })
Returns health scores (0-100, A-F grade) for all contacts. Scores decay when cadence breaks.
Risk flags: NO_CONTACT_14D, NO_CONTACT_30D, CHAMPION_SILENT.
Recomputes automatically if stale (>1h) or missing.
- Input: { slug: string }
- Returns: { overallHealth, atRiskContacts[], coldContacts[], contacts: ContactHealth[] }

### run_deal_agent({ slug, dealName, autonomyLevel?, instruction?, valueThreshold? })
Analyzes deal situation (health, relationships, stakeholder gaps) via LLM (rule-based fallback).
Returns prioritized action plan with confidence scores and full reasoning trace.
autonomyLevel: "observe" (read-only) | "suggest" (queue for review) | "act" (auto-execute)
- Input: { slug, dealName, autonomyLevel?: "observe"|"suggest"|"act", instruction?, valueThreshold?: number }
- Returns: { assessment, riskLevel, plan[], actionsQueued[], actionsExecuted[], trace }

### approve_agent_action({ slug, actionId, approved })
Execute (approved=true) or reject (approved=false) a pending deal agent action.
Find actionId in run_deal_agent response.actionsQueued[].actionId
- Input: { slug, actionId, approved: boolean }
- Returns: { success, actionId, status }

### simulate_revenue({ horizon?, iterations? })
Monte Carlo simulation over all active deals. Adjusts probabilities via health score (D12) and
champion presence (D11). Returns P10/P50/P90 confidence interval + sensitivity map.
horizon: "quarter" (default) | "year"
- Returns: { forecast: { p10, p50, p90, expected, stdDev, atRiskRevenue, byCloseMonth, topRisks, sensitivityMap }, confidence, dealCount }

### get_playbook({ slug, stage?, value?, healthScore?, daysSinceContact?, championPresent? })
Returns playbooks matching the current deal situation. Without deal context, returns all playbooks.
Playbooks are sorted by success rate (highest first). run_deal_agent uses playbooks automatically.
- Input: slug (required) + optional deal context fields for trigger matching
- Returns: { matches: [{ name, score, trigger, successRate, usedCount, content }], totalPlaybooks, slug }

### create_playbook({ slug, name, trigger, content, successRate? })
Create or update a playbook encoding proven tactics for a specific deal situation.
Trigger DSL uses AND-only conditions: deal_stage_<s> | value > N | days_stalled > N | health < N | no_champion | has_champion
- Input: slug, name, trigger (DSL string), content (markdown), successRate? (0–1, default 0.5)
- Returns: { success: true, playbook: { name, trigger, successRate, path } }

### list_playbooks({ slug })
List all playbooks for a customer (metadata only — no body content for performance).
- Input: { slug: string }
- Returns: { playbooks: [{ name, trigger, successRate, usedCount, lastUpdated }], count, slug }

### distill_playbook({ slug, dealName, outcome })
LLM analyzes a deal's interaction history and extracts a reusable playbook.
Run after every won or lost deal to build procedural memory.
outcome: "won" | "lost"
- Returns: { success: true, playbook: { name, trigger, successRate, path }, reasoning }

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

## CLI Reference (Enterprise — Sprints R1–R5)

### dxcrm stages
Manage custom pipeline stages.
\`\`\`
dxcrm stages list                                    # List all stages
dxcrm stages set <id> <label> [--order N] [--probability N] [--color #hex] [--final]
dxcrm stages delete <id>                             # Remove a stage
dxcrm stages reset                                   # Reset to defaults
\`\`\`
Default stages: lead → qualified → proposal → negotiation → won → lost

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

## CLI Reference (D16 — Goal-Based Orchestration)

### dxcrm goal set
Set a goal and get a decomposed action plan based on current pipeline state.
\`\`\`
dxcrm goal set "Close €500k ARR this quarter" --deadline 2026-09-30
\`\`\`

### dxcrm goal status
Show all active goals with progress bars and days remaining.
\`\`\`
dxcrm goal status
\`\`\`

### dxcrm goal update
Manually update goal progress (0–100%).
\`\`\`
dxcrm goal update goal_abc123 --progress 45
\`\`\`

### dxcrm goal cancel
Cancel an active goal.
\`\`\`
dxcrm goal cancel goal_abc123
\`\`\`

### pursue_goal (MCP)
Sets a goal and returns a structured decomposition plan with sub-goals per deal.
RBAC: manager+. Persists to .agentic/goals.json.
\`\`\`
pursue_goal({ goal: "Close €500k ARR this quarter", deadline: "2026-09-30" })
\`\`\`
Returns: { goalId, target, decomposition: { analysis, currentPipeline, gap, subGoals, probabilisticOutcome } }

### get_goal_status (MCP)
Returns all active goals or a specific goal by ID. Shows progress, days remaining, top sub-goals.
\`\`\`
get_goal_status()                         // all active goals
get_goal_status({ goalId: "goal_abc" })  // specific goal
\`\`\`

## CLI Reference (D17 — Real-Time Push Ingestion)

### dxcrm push register
Register a push subscription so providers send events in real-time (no polling).
\`\`\`
dxcrm push register acme-corp --provider gmail --webhook-url https://myserver.com/webhooks/gmail --topic-name projects/x/topics/gmail-push
dxcrm push register acme-corp --provider microsoft-graph --webhook-url https://myserver.com/webhooks/microsoft --client-state <secret>
dxcrm push register acme-corp --provider slack --webhook-url https://myserver.com/webhooks/slack --team-id T12345
\`\`\`

### dxcrm push status
Show all push subscriptions, expiry and events processed.
\`\`\`
dxcrm push status
dxcrm push status --slug acme-corp
dxcrm push status --provider gmail
\`\`\`

### dxcrm push revoke
Revoke a push subscription by ID.
\`\`\`
dxcrm push revoke psub_1716892800_a1b2c3
\`\`\`

### dxcrm push renew
Renew expiring push subscriptions (also runs automatically daily at 06:00).
\`\`\`
dxcrm push renew --all
\`\`\`

### register_push_subscription (MCP)
Register a real-time push subscription. Admin only.
\`\`\`
register_push_subscription({ provider: "gmail", slug: "acme-corp", webhookUrl: "https://myserver.com/webhooks/gmail", gmailTopicName: "projects/x/topics/y" })
\`\`\`
Returns: { subscriptionId, provider, slug, status, expiresAt, warning? }

### get_push_status (MCP)
Show all push subscriptions with expiry and event counts.
\`\`\`
get_push_status()                           // all subscriptions
get_push_status({ slug: "acme-corp" })     // filter by customer
get_push_status({ provider: "gmail" })     // filter by provider
\`\`\`
Returns: { subscriptions: [...], summary: { total, active, expiringSoon, expired } }

### get_org_intelligence (MCP)
Build a stakeholder map for a customer: champions, economic buyers, blockers, health scores, risk flags, and a prioritised recommendation.
\`\`\`
get_org_intelligence({ slug: "acme-corp" })
get_org_intelligence({ slug: "acme-corp", dealName: "Enterprise License" })
\`\`\`
Returns: { slug, updatedAt, people: [{ name, email, role, healthScore, daysSinceContact, contactStrength, riskFlags }], missingRoles, riskAssessment, recommendation }

### open_deal_room (MCP)
Multi-agent deal brief: orchestrates stakeholder map, relationship health, deal health, Monte Carlo simulation, and playbook matching into a single structured brief.
\`\`\`
open_deal_room({ slug: "acme-corp", dealName: "Enterprise License 2026" })
\`\`\`
Returns: { slug, dealName, generatedAt, stakeholders, relationshipHealth, dealHealth, revenueSimulation, recommendedPlaybook, executiveSummary, topPriorities, riskScore }

### get_proactive_briefing (MCP)
Generate a proactive daily briefing: urgent alerts (relationship decay, imminent close dates), opportunities (high-health customers with active pipeline), P50/P90 forecast, and a single top-action recommendation.
\`\`\`
get_proactive_briefing()                         // today
get_proactive_briefing({ date: "2026-05-28" })   // specific date
\`\`\`
Returns: { date, generatedAt, urgent: string[], opportunities: string[], forecast: string, topAction: string }
`.trim();

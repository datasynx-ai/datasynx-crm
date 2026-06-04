<div align="center">

# DatasynxOpenCRM&nbsp;·&nbsp;`dxcrm`

**Local-first, MCP-native CRM. One agent per customer. `npm install`.**

[![npm version](https://img.shields.io/npm/v/@datasynx/agentic-crm.svg?color=cb3837&logo=npm)](https://www.npmjs.com/package/@datasynx/agentic-crm)
[![npm downloads](https://img.shields.io/npm/dm/@datasynx/agentic-crm.svg?color=cb3837)](https://www.npmjs.com/package/@datasynx/agentic-crm)
[![CI](https://github.com/datasynx-ai/datasynx-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/datasynx-ai/datasynx-crm/actions/workflows/ci.yml)
[![Docs](https://github.com/datasynx-ai/datasynx-crm/actions/workflows/pages.yml/badge.svg)](https://datasynx-ai.github.io/datasynx-crm/)
[![license](https://img.shields.io/npm/l/@datasynx/agentic-crm.svg?color=3fb950)](./LICENSE)
[![node](https://img.shields.io/node/v/@datasynx/agentic-crm.svg)](https://nodejs.org)

[**📖 Documentation**](https://datasynx-ai.github.io/datasynx-crm/) · [**📦 npm**](https://www.npmjs.com/package/@datasynx/agentic-crm) · [**💻 GitHub**](https://github.com/datasynx-ai/datasynx-crm) · [**💼 LinkedIn**](https://de.linkedin.com/company/datasynx-ai)

</div>

> **You don't open a CRM to find your customer. Your customer's agent finds you — briefed, current, and ready to act.**

DatasynxOpenCRM stores every customer as structured Markdown — no database, no cloud lock-in — and exposes it to any AI agent over the [Model Context Protocol](https://modelcontextprotocol.io). Your data lives on your machine; your agents read and write it natively in Claude Code, Codex, Cursor, and more.

---

## 5-Minute Quickstart

```bash
npm install -g @datasynx/agentic-crm

# 1. Initialize (detects Claude Code, Codex, Cursor, Claude Desktop, ...)
dxcrm init

# 2. Create your first customer
dxcrm create "Acme Corp" --domain acme.com --email ceo@acme.com

# 3. Your AI agent can now answer:
# "Was ist los mit Acme Corp?"  →  <3 Sekunden Antwort
```

---

## Why DatasynxOpenCRM?

| | Typical SaaS CRM | dxcrm |
|---|---|---|
| Pricing model | Per-seat subscription | Free & open source (MIT), self-hosted |
| AI integration | Add-on or API | Native MCP — works in Claude Code, Codex, Cursor |
| Data location | Vendor cloud | Your machine, plain Markdown files |
| Offline access | Requires connection | Fully offline |
| Privacy / GDPR | Cloud data processing | Local-first, with built-in GDPR erasure |
| Customization | Vendor roadmap | Open source TypeScript — fork & extend |

---

## CLI Commands

### Core

| Command | Description |
|---|---|
| `dxcrm init` | Initialize CRM, detect & configure all AI frameworks |
| `dxcrm create <name>` | Create new customer (`--domain`, `--email`) |
| `dxcrm list [--filter <q>]` | List all customers |
| `dxcrm validate` | Validate all customer data files |
| `dxcrm guide` | Full documentation in terminal |
| `dxcrm mcp docs` | MCP tool reference in terminal |

### MCP Server

| Command | Description |
|---|---|
| `dxcrm mcp start` | Start MCP server (stdio mode, for Claude Code / Codex) |
| `dxcrm mcp start --http [--port 3847]` | Start MCP server in HTTP mode (for team sharing) |

### Session Management

| Command | Description |
|---|---|
| `dxcrm session open <slug>` | Set active customer session |
| `dxcrm session close` | Clear active session |
| `dxcrm session status` | Show current session |

### Sync

| Command | Description |
|---|---|
| `dxcrm sync <slug>` | Sync Gmail + transcripts for a customer |
| `dxcrm sync --provider microsoft` | Sync Outlook via Microsoft Graph API |
| `dxcrm sync --provider google-drive` | Sync Google Drive/Docs files |
| `dxcrm sync --provider teams-transcripts` | Sync Microsoft Teams transcripts |
| `dxcrm sync --provider google-meet` | Sync Google Meet transcripts |
| `dxcrm daemon start` | Start background sync daemon |
| `dxcrm daemon stop` | Stop daemon |
| `dxcrm daemon status` | Check daemon status |
| `dxcrm status` | Show daemon, sync state, customer counts |
| `dxcrm status --unmatched` | List unmatched transcript queue |

### Import

| Command | Description |
|---|---|
| `dxcrm import <file>` | Import from CSV (`--from csv`, `--dry-run`) |
| `dxcrm import ./export/ --from hubspot` | Import HubSpot multi-file export directory |
| `dxcrm import ./export/ --from hubspot --analyze` | Pre-flight: counts, custom props, owners |
| `dxcrm import ./export/ --from hubspot --resume` | Resume interrupted import |
| `dxcrm import ./export/ --from hubspot --owner-map "alice@hs.com=alice"` | Map HubSpot owners to reps |
| `dxcrm import --from hubspot --mode api` | Import HubSpot via API (v4 Associations) |
| `dxcrm import --from salesforce --mode api` | Import Salesforce contacts + activities |
| `dxcrm import --from pipedrive --mode api` | Import Pipedrive persons + activities |

### Agents

| Command | Description |
|---|---|
| `dxcrm agent spawn <slug>` | Spawn wake-triggered agent (Telegram on new email) |
| `dxcrm agent status` | Show all configured agents |
| `dxcrm agent remove <slug>` | Remove agent config |

### Team / Server

| Command | Description |
|---|---|
| `dxcrm server start` | Start HTTP MCP server (`--data <dir>`, `--port 3847`) |
| `dxcrm server status` | Check if HTTP server is running |
| `dxcrm audit` | Show audit trail (`--slug`, `--actor`, `--limit`) |

### Goals

| Command | Description |
|---|---|
| `dxcrm goal set "<description>" --deadline <date>` | Set a goal + get decomposed action plan |
| `dxcrm goal status` | Show all active goals with progress |
| `dxcrm goal update <goalId> --progress <n>` | Update goal progress (0–100%) |
| `dxcrm goal cancel <goalId>` | Cancel an active goal |

### Push Subscriptions (Real-Time Ingestion)

| Command | Description |
|---|---|
| `dxcrm push register <slug> --provider gmail --webhook-url <url>` | Register Gmail Pub/Sub push subscription |
| `dxcrm push register <slug> --provider microsoft-graph --webhook-url <url>` | Register MS Graph webhook |
| `dxcrm push register <slug> --provider slack --webhook-url <url> --team-id <id>` | Register Slack Events subscription |
| `dxcrm push status [--slug <slug>] [--provider <p>]` | Show all subscriptions with expiry |
| `dxcrm push revoke <id>` | Revoke a subscription |
| `dxcrm push renew --all` | Manually renew expiring subscriptions |

### File Attachments

| Command | Description |
|---|---|
| `dxcrm attach <slug> <file>` | Attach a file to a customer (copies to `customers/<slug>/attachments/`) |

```bash
dxcrm attach acme-corp ./proposals/acme-q2-2026.pdf
```

### Pipeline Stages

| Command | Description |
|---|---|
| `dxcrm stages list` | List all configured pipeline stages |
| `dxcrm stages set <id> <label> [--order N] [--probability N] [--color #hex] [--final]` | Create or update a stage |
| `dxcrm stages delete <id>` | Remove a stage |
| `dxcrm stages reset` | Reset to default stages |

### Plugins

| Command | Description |
|---|---|
| `dxcrm plugin list` | List all registered plugins |
| `dxcrm plugin info <name>` | Show plugin details and exposed MCP tools |

**Built-in plugins:**

| Plugin | What it does |
|---|---|
| `slack` | Posts Slack notification after every interaction/deal update |
| `stripe` | Adds `get_stripe_context` MCP tool (revenue, subscriptions) |
| `linear` | Adds `get_linear_issues` MCP tool (linked issues per customer) |

### Intelligence & Governance

| Command | Description |
|---|---|
| `dxcrm usage [--slug <slug>]` | Transparent per-customer LLM token costs |
| `dxcrm memory add\|list\|search` | Agent memories (per customer + global), hybrid-searchable |
| `dxcrm sop add\|list\|find` | Standard operating procedures (global/per customer) |
| `dxcrm tone set\|show` | Per-customer writing tonality (feeds `draft_email`) |
| `dxcrm hygiene scan` | Data-quality scan (missing/malformed/duplicate) |
| `dxcrm policy set <tool> <auto\|approve\|block>` | Human-in-the-loop approval policy |
| `dxcrm approvals list\|approve\|reject` | Review gated agent actions |
| `dxcrm autofill <file>` | Transcript → structured summary/next-steps/objections |
| `dxcrm ask "<question>" [--slug <slug>]` | Natural-language Q&A over your CRM |
| `dxcrm nba <slug>` | Next-best-action recommendations |
| `dxcrm churn assess <slug>` / `dxcrm churn scan` | Churn early-warning (relationship-health based) |
| `dxcrm leadscore train` / `dxcrm leadscore predict <slug>` | Predictive lead-scoring (learned on won/lost) |
| `dxcrm enrich <slug> [--write]` | Enrich customer facts (offline + plugins, vault-backed) |
| `dxcrm coach <file>` | Conversation intelligence (talk-ratio/objections/coaching) |
| `dxcrm vault set\|get\|list\|rm` | Local AES-256-GCM credential vault |
| `dxcrm compliance` | Governance posture (AI-Act Art.50, local-LLM, PII, guardrails) |

See [docs/cli-reference.md](./docs/cli-reference.md) and [docs/compliance.md](./docs/compliance.md) for full details.

### Security & Compliance

| Command | Description |
|---|---|
| `dxcrm rbac set <actor> <role>` | Assign role (admin/manager/rep) |
| `dxcrm rbac show` | List configured roles |
| `dxcrm rbac check <actor> <tool>` | Check if actor can call a tool |
| `dxcrm gdpr erase <slug> [--confirm]` | GDPR erasure (dry-run without --confirm) |
| `dxcrm gdpr list-erasures` | Show erasure log |
| `dxcrm security-report [--output <file>]` | Generate Markdown security questionnaire |

### Backup & Restore (Enterprise)

| Command | Description |
|---|---|
| `dxcrm backup [path]` | Backup `customers/` + `.agentic/` with SHA-256 manifest |
| `dxcrm backup --encrypt` | AES-256-GCM encrypted backup |
| `dxcrm backup --remote s3://bucket/path/` | Backup + upload to S3 |
| `dxcrm backup --remote rsync://host:/path/` | Backup + rsync to remote |
| `dxcrm backup verify <path>` | Verify backup integrity (unzip -t + manifest check) |
| `dxcrm backup drill <path>` | Restore-drill: verify a backup is actually restorable |
| `dxcrm backup list` | List all logged backups with size + verification status |
| `dxcrm backup schedule --every day --keep 7` | Daily backups, keep last 7 |
| `dxcrm backup schedule --every week --keep 4 --monthly 12` | Grandfathering retention |
| `dxcrm restore <path>` | Restore from backup |

### Email Sequences (H1)

| Command | Description |
|---|---|
| `dxcrm sequence list` | List all sequences |
| `dxcrm sequence create <id> --name <name>` | Create a new sequence |
| `dxcrm sequence enroll <id> --slug <slug> --email <email>` | Enroll contact |
| `dxcrm sequence status` | Show active enrollments |
| `dxcrm sequence run` | Manually trigger daily send cycle |

### Quotes (H4)

| Command | Description |
|---|---|
| `dxcrm quote generate --slug <slug> --deal <dealName>` | Generate HTML quote (Q-YYYY-NNN) |
| `dxcrm quote list [--slug <slug>]` | List all quotes |
| `dxcrm quote get <quoteNumber>` | Get quote details |

### Tickets (H6)

| Command | Description |
|---|---|
| `dxcrm ticket list [--slug <slug>] [--status open] [--priority urgent]` | List tickets |
| `dxcrm ticket create <slug> --title <title> [--priority high]` | Open ticket with SLA |
| `dxcrm ticket update <slug> <ticketId> --status in-progress` | Update ticket |
| `dxcrm ticket close <slug> <ticketId> [--resolution <text>]` | Close ticket |

### Surveys (H7)

| Command | Description |
|---|---|
| `dxcrm survey create <id> [--type nps\|csat\|ces]` | Create survey definition |
| `dxcrm survey send <surveyId> --slug <slug> --email <email>` | Generate survey token + email |
| `dxcrm survey results <surveyId> [--slug <slug>]` | Show NPS score + responses |

### Knowledge Base (H8)

| Command | Description |
|---|---|
| `dxcrm kb list [--category <cat>] [--public]` | List KB articles |
| `dxcrm kb get <id>` | Get article body |
| `dxcrm kb search <query> [--public]` | Full-text search |
| `dxcrm kb create <id> --title <title> [--category <cat>]` | Create article |
| `dxcrm kb delete <id>` | Delete article |

---

## MCP Tools (56 tools for AI Agents)

These tools are available to any AI agent connected via MCP (Claude Code, Codex, Cursor, etc.):

| Tool | Description | RBAC |
|---|---|---|
| `get_capabilities` | Full tool list + CRM workflow guide | any |
| `get_active_session` | Current active customer session | any |
| `get_customer_context` | Complete customer brief (facts + interactions + pipeline) | any |
| `search_customer_knowledge` | Semantic search through customer history | any |
| `list_customers` | All customers with stage + deal value | any |
| `log_interaction` | Record call/email/meeting | rep+ |
| `update_deal` | Update pipeline deal stage/value | rep+ |
| `update_customer_facts` | Create or update customer profile (creates new customer if slug doesn't exist) | admin |
| `export_customer` | Export customer data as JSON/Markdown | any |
| `get_deal_health` | Score deal health (A–F, 0–100) per deal | any |
| `get_pipeline_forecast` | Aggregate weighted pipeline revenue | any |
| `summarize_meeting` | Summarize transcript + log interaction | rep+ |
| `get_pipeline_stages` | List configured pipeline stages | any |
| `get_market_intelligence` | Search across all customers for patterns | any |
| `get_relationship_graph` | Stakeholder map + knowledge graph (champions, blockers, economic buyers) | any |
| `get_relationship_health` | Health score (0–100, A–F) per contact, decay detection, recommendations | any |
| `run_deal_agent` | Analyze deal + generate action plan (observe/suggest/act modes) | rep+ |
| `approve_agent_action` | Approve or reject a queued deal agent action | rep+ |
| `simulate_revenue` | Monte Carlo pipeline forecast with P10/P50/P90 confidence intervals | any |
| `get_playbook` | Retrieve matching playbooks for a deal situation | any |
| `create_playbook` | Create or update a playbook with trigger DSL | rep+ |
| `list_playbooks` | List all playbooks for a customer | any |
| `distill_playbook` | LLM-extract reusable playbook from won/lost deal history | rep+ |
| `pursue_goal` | Set goal + decompose into prioritized deal action plan | manager+ |
| `get_goal_status` | Get active goals, progress, and sub-goal breakdown | any |
| `register_push_subscription` | Register real-time push subscription (Gmail/MS Graph/Slack) | admin |
| `get_push_status` | Show push subscriptions with expiry and event counts | any |
| `get_org_intelligence` | Stakeholder map: champions, buyers, blockers, health scores, risk flags | any |
| `open_deal_room` | Multi-agent deal brief: graph + health + simulation + playbook in one call | any |
| `get_proactive_briefing` | Daily briefing: urgent alerts, opportunities, P50/P90 forecast, top action | any |
| `list_email_templates` | List email templates by category (outreach/followup/support) | any |
| `get_email_template` | Get full template with variable placeholders | any |
| `draft_email` | Draft personalized email from template + customer facts | rep+ |
| `enroll_in_sequence` | Enroll contact in multi-step email sequence | rep+ |
| `list_sequence_enrollments` | List enrollments; filter by slug or status | any |
| `unenroll_from_sequence` | Pause an active enrollment | rep+ |
| `list_sequences` | List all sequences with step count + enrollment count | any |
| `generate_quote` | Create HTML quote with auto-numbering (Q-YYYY-NNN) | rep+ |
| `get_quote_status` | Get quote or list all quotes for a customer | any |
| `get_booking_link` | Get Calendly booking URL, optionally pre-filled with customer info | rep+ |
| `create_ticket` | Open support ticket with auto-SLA due date | rep+ |
| `update_ticket` | Update ticket status or assignee | rep+ |
| `list_tickets` | List tickets sorted by priority (cross-customer) | any |
| `close_ticket` | Close ticket and optionally log resolution as interaction | rep+ |
| `send_nps_survey` | Generate NPS survey token + HTML email body | rep+ |
| `get_survey_results` | NPS score, promoters/passives/detractors, all responses | any |
| `search_knowledge_base` | Full-text search across KB articles | any |
| `create_kb_article` | Create or update knowledge base article | rep+ |
| `backup_now` | Trigger immediate backup with manifest + integrity check | admin |
| `list_backups` | List backups with date, size, verification status | any |
| `trigger_sync` | Force immediate Gmail sync for one or all customers (bypasses 30-min daemon cycle) | rep+ |
| `get_audit_log` | Read append-only audit log — filter by customer, actor, or limit | admin |

### Tool Examples

```json
// Get customer context before a meeting
get_customer_context({ "slug": "acme-corp" })

// Log a call after it ends
log_interaction({
  "slug": "acme-corp",
  "type": "Call",
  "summary": "Discussed Q3 renewal. Budget confirmed at €50k.",
  "with": "Max Müller",
  "nextSteps": ["Send proposal by Friday"],
  "direction": "inbound"
})

// Update deal stage
update_deal({
  "slug": "acme-corp",
  "dealName": "Q3 Renewal",
  "stage": "negotiation",
  "value": 50000,
  "probability": 75
})

// Search historical emails
search_customer_knowledge({
  "slug": "acme-corp",
  "query": "pricing negotiation budget"
})

// Run deal agent (suggest mode — queues actions for review)
run_deal_agent({
  "slug": "acme-corp",
  "dealName": "Q3 Renewal",
  "autonomyLevel": "suggest"
})

// Approve a queued agent action
approve_agent_action({
  "slug": "acme-corp",
  "actionId": "da_1748346900000_a3f7x2",
  "approved": true
})

// Get matching playbook for a deal in negotiation
get_playbook({
  "slug": "acme-corp",
  "stage": "negotiation",
  "value": 75000,
  "daysSinceContact": 10
})

// Create a playbook from proven tactics
create_playbook({
  "slug": "acme-corp",
  "name": "enterprise-renewal",
  "trigger": "deal_stage_negotiation AND value > 50000 AND days_stalled > 7",
  "content": "# Enterprise Renewal\n\n## Steps\n1. Call economic buyer directly.",
  "successRate": 0.73
})

// Extract playbook from a won deal
distill_playbook({
  "slug": "acme-corp",
  "dealName": "Q3 Enterprise License",
  "outcome": "won"
})

// Set a revenue goal — get decomposed action plan
pursue_goal({
  "goal": "Close €500k ARR this quarter",
  "deadline": "2026-09-30",
  "context": "Focus on existing pipeline"
})

// Check goal progress
get_goal_status()

// Register Gmail Pub/Sub push subscription (events arrive in <60s instead of 30min polling)
register_push_subscription({
  "provider": "gmail",
  "slug": "acme-corp",
  "webhookUrl": "https://myserver.com/webhooks/gmail",
  "gmailTopicName": "projects/my-project/topics/gmail-push"
})

// Check all active push subscriptions
get_push_status()
// → { subscriptions: [{ id, provider, slug, status, expiresInHours, needsRenewal, eventsProcessed }], summary: {...} }

// Stakeholder map: champions, buyers, blockers with health scores
get_org_intelligence({ "slug": "acme-corp" })
// → { slug, people: [{ name, role, healthScore, daysSinceContact, riskFlags }], missingRoles, riskAssessment, recommendation }

// Multi-agent deal brief (parallel orchestration of 6 sub-systems)
open_deal_room({ "slug": "acme-corp", "dealName": "Enterprise License 2026" })
// → { executiveSummary, topPriorities, riskScore, stakeholders, dealHealth, revenueSimulation, recommendedPlaybook }

// Proactive morning briefing (scans all customers automatically)
get_proactive_briefing()
// → { urgent: ["acme-corp: Sarah silent 45d"], opportunities: [...], forecast: "P50 €287k", topAction: "..." }
```

---

## Framework Integration

`dxcrm init` automatically registers the MCP server in all detected frameworks:

| Framework | Tier | Harness |
|---|---|---|
| Claude Code | 1 | CLAUDE.md + ~/.claude.json + .claude/settings.json |
| Codex CLI | 1 | AGENTS.md + ~/.codex/config.toml |
| Grok Build (xAI) | 1 | AGENTS.md + ~/.grok/user-settings.json + .grok/settings.json |
| OpenClaw | 1 | SOUL.md + AGENTS.md + TOOLS.md |
| Hermes Agent | 1 | SOUL.md + Skill |
| Antigravity CLI (`agy`) | 1 | GEMINI.md + AGENTS.md + SKILL.md |
| Cursor | 2 | `.cursor/rules/datasynx-crm.mdc` |
| Windsurf | 2 | MCP config only |
| Cline | 2 | MCP config only |
| Claude Desktop | 2 | MCP config only |

---

## Data Structure

```
~/.dxcrm/
├── customers/
│   └── acme-corp/
│       ├── main_facts.md        # Customer profile (YAML frontmatter)
│       ├── interactions.md      # All calls/emails/meetings (newest first)
│       ├── pipeline.md          # Deal stages
│       ├── sources.json         # Gmail query, transcript paths
│       ├── attachments/
│       └── transcripts/
└── .agentic/
    ├── config.json              # CRM configuration
    ├── sources.json             # Global sync sources
    ├── rbac.json                # Role assignments
    ├── audit.log                # Append-only audit trail
    ├── agents/                  # Per-customer agent configs
    └── server.pid               # HTTP server PID (team mode)
```

### Customer Profile Schema (`main_facts.md`)

```yaml
---
name: Acme Corp
domain: acme.com
email: ceo@acme.com
phone: +49 89 12345678
industry: SaaS
primary_contact: Max Müller
relationship_stage: active   # prospect | active | churned | paused
deal_value: 50000
tags: [enterprise, strategic]
created: 2026-01-15
updated: 2026-05-26
---

## Quick Reference
Key facts in 2-3 bullet points.

## Contacts
- Max Müller (CEO) — max@acme.com

## Critical Context
Any blocking facts the agent must know before every conversation.

## Open Questions
Outstanding items needing follow-up.
```

---

## Security & Compliance

```bash
# Role-Based Access Control
export DXCRM_ACTOR=alice
dxcrm rbac set alice admin       # Roles: admin | manager | rep
dxcrm rbac show                  # List all configured roles
dxcrm rbac check alice update_deal  # Check permission

# GDPR Erasure
dxcrm gdpr erase acme-corp                # Dry-run (shows what would be deleted)
dxcrm gdpr erase acme-corp --confirm      # Permanent deletion + audit entry
dxcrm gdpr list-erasures                  # Erasure history

# Security Questionnaire
dxcrm security-report                          # Print to terminal
dxcrm security-report --output sec-report.md  # Write to file
```

**RBAC roles:**
- `admin` — full access: all tools including `update_customer_facts` and `export_customer`
- `manager` — `log_interaction` + `update_deal` + all read tools
- `rep` — `log_interaction` + `update_deal` + all read tools

---

## Sync Setup

### Gmail

```bash
dxcrm init   # Sets up Gmail OAuth
dxcrm sync acme-corp   # Sync emails for one customer
dxcrm daemon start     # Background sync every 15 min
```

### Microsoft Outlook

Write token file, then sync:

```bash
# Write token (from your OAuth app)
echo '{"accessToken":"<token>"}' > ~/.dxcrm/.agentic/microsoft-token.json

dxcrm sync --provider microsoft
```

### Salesforce Import

```bash
dxcrm import --from salesforce --mode api \
  --token <access_token> \
  --url https://myco.salesforce.com
```

Two-pass: contacts → customers, tasks → interactions (linked via WhoId).

### Pipedrive Import

```bash
dxcrm import --from pipedrive --mode api \
  --token <api_token> \
  --url https://myco.pipedrive.com
```

Two-pass: persons → customers, activities → interactions.

---

## Agent Wake Notifications

Per-customer wake agents send a Telegram message whenever a new email arrives from that customer's domain. The daemon detects the new email during its sync cycle and calls `notifyAgentWake()` for all customers that have an agent configured.

### Setup

```bash
# 1. Export your Telegram credentials
export TELEGRAM_BOT_TOKEN=123456789:AAxxxxx
export TELEGRAM_CHAT_ID=987654321

# 2. Spawn a wake agent for a customer
dxcrm agent spawn acme-corp --channel telegram

# 3. (Optional) Use a different chat ID per customer
dxcrm agent spawn beta-gmbh --channel telegram --chat-id 111222333

# 4. Check all configured agents
dxcrm agent status

# 5. Remove an agent
dxcrm agent remove acme-corp
```

### How it works

1. The background daemon syncs Gmail every 30 minutes (configurable via `DXCRM_DAEMON_INTERVAL`).
2. On a new email from a customer domain, `notifyAgentWake()` is called.
3. If an agent config exists for that customer (`.agentic/agents/<slug>.agent.json`), a Telegram message is sent to the configured `chatId` (or `TELEGRAM_CHAT_ID` env var).
4. The message contains customer name, email subject, and a link to open the deal room.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes (for agents) | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Yes (for agents) | Default chat ID for all agents |
| `DXCRM_DATA_DIR` | No | Override data directory (default: `~/.dxcrm`) |
| `DXCRM_ACTOR` | No | Set RBAC actor identity for audit trail |
| `DXCRM_SURVEY_SECRET` | No | HMAC secret for tamper-proof survey tokens |
| `ANTHROPIC_API_KEY` | No | Enables LLM features (summarize_meeting, distill_playbook, run_deal_agent). Falls back gracefully to rule-based analysis. |

---

## Team Setup

Run on a shared VM — all team members share one data directory:

```bash
# On the VM
dxcrm server start --data /mnt/crm-data --port 3847
```

Each team member's framework config:

```json
{
  "mcpServers": {
    "datasynx-opencrm": {
      "url": "http://vm-ip:3847/mcp"
    }
  }
}
```

Set actor identity per session:
```bash
export DXCRM_ACTOR=alice
```

---

## Manual MCP Configuration

### Claude Code

```json
// ~/.claude.json
{
  "mcpServers": {
    "datasynx-opencrm": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/node_modules/@datasynx/agentic-crm/dist/mcp.js"]
    }
  }
}
```

### Grok Build (xAI)

```json
// ~/.grok/user-settings.json
// NOTE: Grok uses an ARRAY for mcpServers (not an object/map like Claude)
{
  "mcpServers": [
    {
      "name": "datasynx-opencrm",
      "transport": {
        "type": "stdio",
        "command": "node",
        "args": ["/path/to/node_modules/@datasynx/agentic-crm/dist/mcp.js"],
        "env": { "DXCRM_DATA_DIR": "/path/to/your/.dxcrm" }
      }
    }
  ]
}
```

Run `grok inspect` to verify the server is discovered. Grok Build reads `AGENTS.md` and `CLAUDE.md` natively — both are written by `dxcrm init`.

### Claude Desktop

```json
// macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
// Windows: %APPDATA%\Claude\claude_desktop_config.json
// Linux: ~/.config/claude-desktop/claude_desktop_config.json
{
  "mcpServers": {
    "datasynx-opencrm": {
      "command": "node",
      "args": ["/path/to/node_modules/@datasynx/agentic-crm/dist/mcp.js"]
    }
  }
}
```

### Cursor / Windsurf / Cline

Use the HTTP server URL after `dxcrm mcp start --http`:

```
http://localhost:3847/mcp
```

---

## Development

```bash
git clone https://github.com/datasynx-ai/datasynx-crm
cd datasynx-crm
npm install
npm test          # All tests (Vitest, TDD)
npm run build     # tsdown → dist/
npm run typecheck # TypeScript strict check
```

### Running Tests

```bash
npm test                           # All tests
npm test -- --run src/__tests__    # Unit tests only
npm test -- --run __tests__/e2e    # E2E tests only
npm test -- --reporter verbose     # Verbose output
```

---

## Docs

📖 **Full documentation site:** [datasynx-ai.github.io/datasynx-crm](https://datasynx-ai.github.io/datasynx-crm/)

- [Quickstart — Real Gmail (5 min)](./docs/quickstart-real.md)
- [CLI Reference](./docs/cli-reference.md)
- [MCP Tools](./docs/mcp-tools.md)
- [Schemas](./docs/schemas.md)
- [Framework Integrations](./docs/integrations.md)
- [Deployment](./docs/deployment.md)
- [Team Setup](./docs/team-setup.md)

---

## Community & Links

- 📦 **npm:** [@datasynx/agentic-crm](https://www.npmjs.com/package/@datasynx/agentic-crm)
- 💻 **GitHub:** [datasynx-ai/datasynx-crm](https://github.com/datasynx-ai/datasynx-crm)
- 🐛 **Issues:** [Report a bug or request a feature](https://github.com/datasynx-ai/datasynx-crm/issues)
- 💼 **LinkedIn:** [Datasynx AI](https://de.linkedin.com/company/datasynx-ai)
- 📄 **License:** [MIT](./LICENSE)

---

<div align="center">
<sub>Built with TypeScript · Powered by the Model Context Protocol · © 2026 Datasynx</sub>
</div>

# DatasynxOpenCRM (`dxcrm`)

> Local-first, MCP-native CRM. One agent per customer. `npm install`.

---

## 5-Minute Quickstart

```bash
npm install -g datasynx-opencrm

# 1. Initialize (detects Claude Code, Codex, Cursor, Claude Desktop, ...)
dxcrm init

# 2. Create your first customer
dxcrm create "Acme Corp" --domain acme.com --email ceo@acme.com

# 3. Your AI agent can now answer:
# "Was ist los mit Acme Corp?"  →  <3 Sekunden Antwort
```

---

## Why DatasynxOpenCRM?

| Problem | HubSpot | dxcrm |
|---|---|---|
| Monthly cost | €90–900/seat | Free (self-hosted) |
| AI integration | Plugin/API only | Native MCP, works in Claude Code/Codex/Cursor |
| Data ownership | Their cloud | Your machine, your files |
| Offline access | No | Yes — pure markdown |
| Privacy/GDPR | Complex | Full GDPR erasure built-in |
| Customization | Limited | Fork it, it's TypeScript |

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
| `dxcrm daemon start` | Start background sync daemon |
| `dxcrm daemon stop` | Stop daemon |
| `dxcrm daemon status` | Check daemon status |
| `dxcrm status` | Show daemon, sync state, customer counts |
| `dxcrm status --unmatched` | List unmatched transcript queue |

### Import

| Command | Description |
|---|---|
| `dxcrm import <file>` | Import from HubSpot/CSV (`--from hubspot\|csv`, `--dry-run`) |
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

### Pipeline Stages

| Command | Description |
|---|---|
| `dxcrm stages list` | List all configured pipeline stages |
| `dxcrm stages set <id> <label> [--order N] [--probability N] [--color #hex] [--final]` | Create or update a stage |
| `dxcrm stages delete <id>` | Remove a stage |
| `dxcrm stages reset` | Reset to default stages |

### Security & Compliance

| Command | Description |
|---|---|
| `dxcrm rbac set <actor> <role>` | Assign role (admin/manager/rep) |
| `dxcrm rbac show` | List configured roles |
| `dxcrm rbac check <actor> <tool>` | Check if actor can call a tool |
| `dxcrm gdpr erase <slug> [--confirm]` | GDPR erasure (dry-run without --confirm) |
| `dxcrm gdpr list-erasures` | Show erasure log |
| `dxcrm security-report [--output <file>]` | Generate Markdown security questionnaire |

### Backup & Restore

| Command | Description |
|---|---|
| `dxcrm backup [path]` | Backup customers/ directory |
| `dxcrm backup schedule --every day --keep 7` | Schedule automatic backups |
| `dxcrm restore <path>` | Restore from backup |

---

## MCP Tools (for AI Agents)

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
| `update_customer_facts` | Update customer profile (name, domain, contact, stage, tags) | admin |
| `export_customer` | Export customer data as JSON/Markdown | any |
| `get_deal_health` | Score deal health (A–F, 0–100) per deal | any |
| `get_pipeline_forecast` | Aggregate weighted pipeline revenue | any |
| `summarize_meeting` | Summarize transcript + log interaction | rep+ |
| `get_pipeline_stages` | List configured pipeline stages | any |
| `get_market_intelligence` | Search across all customers for patterns | any |

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
- `admin` — full access including `update_customer_facts`
- `manager` — all read + write tools except profile updates
- `rep` — read tools + `log_interaction` + `update_deal`

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
      "args": ["/path/to/node_modules/datasynx-opencrm/dist/mcp.js"]
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
        "args": ["/path/to/node_modules/datasynx-opencrm/dist/mcp.js"],
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
      "args": ["/path/to/node_modules/datasynx-opencrm/dist/mcp.js"]
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
git clone https://github.com/datasynx/datasynx-crm
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

- [CLI Reference](./docs/cli-reference.md)
- [MCP Tools](./docs/mcp-tools.md)
- [Schemas](./docs/schemas.md)
- [Framework Integrations](./docs/integrations.md)
- [Deployment](./docs/deployment.md)
- [HTML Docs](./docs/index.html) — open locally in browser

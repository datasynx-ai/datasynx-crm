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

## CLI Commands

| Command | Description |
|---|---|
| `dxcrm init` | Initialize CRM, detect & configure all AI frameworks |
| `dxcrm create <name>` | Create new customer (`--domain`, `--email`) |
| `dxcrm list [--filter <q>]` | List all customers |
| `dxcrm sync <slug>` | Sync Gmail + transcripts for a customer |
| `dxcrm session open <slug>` | Set active customer session |
| `dxcrm session close` | Clear active session |
| `dxcrm session status` | Show current session |
| `dxcrm validate` | Validate all customer data |
| `dxcrm guide` | Full documentation in terminal |
| `dxcrm mcp docs` | MCP tool reference |
| `dxcrm mcp start` | Start MCP server (stdio) |
| `dxcrm mcp start --http [--port 3847]` | Start MCP server in HTTP mode |
| `dxcrm daemon start` | Start background sync daemon |
| `dxcrm daemon stop` | Stop daemon |
| `dxcrm daemon status` | Check daemon status |
| `dxcrm status` | Show daemon, sync state, customer counts |
| `dxcrm status --unmatched` | List unmatched transcript queue |
| `dxcrm agent spawn <slug>` | Spawn wake-triggered agent (Telegram on new email) |
| `dxcrm agent status` | Show all configured agents |
| `dxcrm agent remove <slug>` | Remove agent config |
| `dxcrm import <file>` | Import from HubSpot/CSV (`--from hubspot\|csv`, `--dry-run`) |
| `dxcrm server start` | Start HTTP MCP server (`--data <dir>`, `--port 3847`) |
| `dxcrm server status` | Check if HTTP server is running |
| `dxcrm audit` | Show audit trail (`--slug`, `--actor`, `--limit`) |
| `dxcrm rbac set <actor> <role>` | Assign role (admin/manager/rep) |
| `dxcrm rbac show` | List configured roles |
| `dxcrm rbac check <actor> <tool>` | Check if actor can call a tool |
| `dxcrm gdpr erase <slug> [--confirm]` | GDPR erasure (dry-run without --confirm) |
| `dxcrm gdpr list-erasures` | Show erasure log |
| `dxcrm security-report [--output <file>]` | Generate Markdown security questionnaire |
| `dxcrm sync --provider microsoft` | Sync Outlook emails via Graph API |
| `dxcrm import --from salesforce --mode api` | Import Salesforce contacts + activities |
| `dxcrm import --from pipedrive --mode api` | Import Pipedrive persons + activities |
| `dxcrm backup [path]` | Backup customers/ directory |
| `dxcrm backup schedule --every day --keep 7` | Schedule automatic backups |
| `dxcrm restore <path>` | Restore from backup |

---

## MCP Tools (for AI Agents)

| Tool | Description |
|---|---|
| `get_capabilities` | Full tool list + CRM workflow guide |
| `get_customer_context` | Complete customer brief (facts + interactions + pipeline) |
| `search_customer_knowledge` | Semantic search through customer history |
| `list_customers` | All customers with stage + deal value |
| `log_interaction` | Record call/email/meeting |
| `update_deal` | Update pipeline deal stage/value |
| `update_customer_facts` | Update customer profile (name, domain, contact, stage, tags) |
| `export_customer` | Export customer data as JSON/Markdown |
| `get_active_session` | Current active customer session |

---

## Framework Integration

`dxcrm init` automatically registers the MCP server in all detected frameworks:

| Framework | Tier | Harness |
|---|---|---|
| Claude Code | 1 | CLAUDE.md + settings.json |
| Codex CLI | 1 | AGENTS.md |
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
customers/
└── acme-corp/
    ├── main_facts.md        # Customer profile (YAML frontmatter)
    ├── interactions.md      # All calls/emails/meetings (newest first)
    ├── pipeline.md          # Deal stages
    ├── sources.json         # Gmail query, transcript paths
    ├── attachments/
    └── transcripts/

.agentic/
├── config.json              # CRM configuration
├── sources.json             # Global sync sources
├── audit.log                # Append-only audit trail (Phase 3)
├── agents/                  # Per-customer agent configs (Phase 2)
└── server.pid               # HTTP server PID (Phase 3)
```

## Security & Compliance (Phase 4)

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

**Token files** (written by external OAuth apps):
- `.agentic/microsoft-token.json` — Microsoft Graph API token (`accessToken` or `access_token`)

**Sync providers:**
```bash
dxcrm sync --provider gmail        # Gmail (default)
dxcrm sync --provider microsoft    # Outlook via Graph API
```

**Salesforce import:**
```bash
dxcrm import --from salesforce --mode api --token <tok> --url https://myco.salesforce.com
```
Two-pass import: contacts → customers, tasks → interactions (linked via WhoId).

---

## Team Setup (Phase 3)

Run on a shared VM:
```bash
dxcrm server start --data /mnt/crm-data --port 3847
```
Each team member adds to their AI framework config:
```
url: http://vm-ip:3847/mcp
```
Set actor identity: `export DXCRM_ACTOR=alice`

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

---

## Docs

- [CLI Reference](./docs/cli-reference.md)
- [MCP Tools](./docs/mcp-tools.md)
- [Schemas](./docs/schemas.md)
- [Framework Integrations](./docs/integrations.md)
- [Deployment](./docs/deployment.md)

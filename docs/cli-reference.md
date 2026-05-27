# CLI Reference — dxcrm

## dxcrm init

Initialize DatasynxOpenCRM in the current directory.

```bash
dxcrm init
```

**What it does:**
1. Detects all installed AI frameworks (Claude Code, Codex, Cursor, Claude Desktop, ...)
2. Registers the MCP server in each detected framework
3. Writes harness files (CLAUDE.md, AGENTS.md, SOUL.md, ...) for context injection
4. Creates `.agentic/` directory with `config.json` + `sources.json`
5. Starts background daemon for automatic sync

---

## dxcrm create

Create a new customer.

```bash
dxcrm create "Acme Corp" [--domain acme.com] [--email ceo@acme.com]
```

**Options:**
- `--domain <domain>` — Primary domain (used for Gmail sync query)
- `--email <email>` — Primary contact email

**Output:**
```
✓ Created customer: acme-corp
  Dir: ./customers/acme-corp/
  Files: main_facts.md, interactions.md, pipeline.md, sources.json
```

---

## dxcrm list

List all customers.

```bash
dxcrm list [--filter <query>]
```

**Options:**
- `--filter <query>` — Substring filter on name or slug

---

## dxcrm sync

Sync emails, transcripts, and cloud files for a customer. Writes to `interactions.md` and indexes into LanceDB for semantic search.

```bash
dxcrm sync <slug>                          # Full sync (last 30 days)
dxcrm sync <slug> --since 2026-05-01       # Only emails/files after date
dxcrm sync <slug> --gmail                  # Gmail only
dxcrm sync <slug> --transcripts            # Transcripts only
dxcrm sync --provider microsoft            # Outlook via Microsoft Graph API
dxcrm sync --provider google-drive        # Google Drive/Docs files
dxcrm sync --provider teams-transcripts   # Microsoft Teams transcripts
dxcrm sync --provider google-meet         # Google Meet transcripts
```

**Options:**
- `--since <YYYY-MM-DD>` — Only sync emails/transcripts after this date
- `--gmail` — Gmail only (skip transcript processing)
- `--transcripts` — Transcripts only (skip Gmail sync)
- `--provider <provider>` — Sync provider: `gmail` | `microsoft` | `google-drive` | `teams-transcripts` | `google-meet`

**Prerequisites for Gmail:**
- `.agentic/gmail-credentials.json` — OAuth2 credentials
- `.agentic/gmail-token.json` — OAuth2 access token (run `dxcrm sync --setup-gmail` to generate)
- `customers/<slug>/sources.json` — Gmail query configured

---

## dxcrm session

Manage the active customer session.

```bash
dxcrm session open <slug>    # Set active customer
dxcrm session close           # Clear active session
dxcrm session status          # Show current session
```

---

## dxcrm validate

Validate all customer data against schemas.

```bash
dxcrm validate [--fix]
```

**Options:**
- `--fix` — Auto-fix recoverable issues (missing fields with defaults)

**Exit codes:**
- `0` — All valid
- `1` — Validation errors found

---

## dxcrm guide

Print structured documentation for all commands and MCP tools.

```bash
dxcrm guide
dxcrm mcp docs   # MCP tool reference only
```

---

## dxcrm mcp

MCP server management and documentation.

```bash
dxcrm mcp docs                         # Print MCP tool reference
dxcrm mcp start                        # Start MCP server (stdio transport)
dxcrm mcp start --http                 # Start MCP server (HTTP transport, port 3847)
dxcrm mcp start --http --port 4000    # HTTP on custom port
```

HTTP mode exposes `POST /mcp` (StreamableHTTP) and `GET /health`.
Set `DXCRM_MCP_MODE=http` + `DXCRM_MCP_PORT=3847` env vars to configure
when using the server as a subprocess.

---

## dxcrm daemon

Manage the background sync daemon.

```bash
dxcrm daemon start    # Start daemon (detached process)
dxcrm daemon stop     # Stop daemon
dxcrm daemon status   # Check if running + PID
```

---

## dxcrm status

Show overall CRM health: daemon state, sync ages, customer count, unmatched transcripts.

```bash
dxcrm status                  # Summary view
dxcrm status --unmatched      # List unmatched transcript queue
```

**Options:**
- `--unmatched` — List all entries in the unmatched-transcripts queue

**Output example:**
```
─────────────────────────────────────
 DatasynxOpenCRM Status
─────────────────────────────────────
 Daemon:     running (PID 12345)
 Kunden:     3 aktiv
 Syncs:
   acme-corp:   Gmail vor 12 Min
   beta-gmbh:   Gmail vor 2 Std
   startup-ag:  noch kein Sync
 Unmatched:   2 Transcripts (dxcrm status --unmatched)
─────────────────────────────────────
```

---

## dxcrm agent

Manage per-customer wake-triggered agents. On new email activity, the daemon sends a Telegram notification with customer context.

```bash
dxcrm agent spawn acme-corp --channel telegram          # Spawn agent (default: wake on email)
dxcrm agent spawn acme-corp --channel telegram --chat-id 12345   # With custom chat ID
dxcrm agent status                                       # List all agents + last wake time
dxcrm agent remove acme-corp                             # Remove agent config
```

**Options (spawn):**
- `--channel <channel>` — Notification channel (`telegram`). Default: `telegram`
- `--chat-id <id>` — Telegram chat ID override (falls back to `TELEGRAM_CHAT_ID` env var)
- `--wake-on-email` — Wake on new email activity (default: on)

**Environment variables:**
- `TELEGRAM_BOT_TOKEN` — Required for Telegram notifications
- `TELEGRAM_CHAT_ID` — Default chat ID (can be overridden per agent with `--chat-id`)

**Agent config** stored in `.agentic/agents/<slug>.agent.json`.

---

## dxcrm import

Import customers and interactions from HubSpot or generic CSV exports. Two-pass: creates customers first, then imports activities. Idempotent — re-running skips already-imported rows.

```bash
dxcrm import contacts.csv --from csv                    # Import generic CSV
dxcrm import hubspot-export.csv --from hubspot           # Import HubSpot export
dxcrm import hubspot-export.csv --from hubspot --dry-run # Preview field mapping
```

**Options:**
- `--from <source>` — Source format: `hubspot` | `csv`. Default: `csv`
- `--dry-run` — Preview what would be imported without writing

**Field mapping (HubSpot):**
- `Company Name` → customer name
- `Email` → contact email
- `Domain/Website` → domain
- `Notes` / `Description` → interaction summary
- `Activity Type` → interaction type (Call/Email/Meeting/Note)
- `Activity Date` → interaction date
- `Record ID` → source reference ID

**sourceRef format:**
- HubSpot: `hubspot://activity/<Record ID>`
- CSV: `csv://row/<sha256-of-row>`

---

## dxcrm server (Phase 3 — Team Setup)

Start a shared HTTP MCP server for team use. Multiple agents connect via `url: http://vm-ip:3847/mcp`.

```bash
dxcrm server start                              # Start on default port 3847
dxcrm server start --port 3847 --data /mnt/crm-data   # With custom data dir
dxcrm server status                             # Check if running + PID
```

**Options (start):**
- `--port <port>` — HTTP port. Default: `3847`
- `--data <dir>` — Data directory (sets `DXCRM_DATA_DIR`). Default: `process.cwd()`

**PID file**: `.agentic/server.pid`

**Team member setup** — add to AI framework config:
```
url: http://vm-ip:3847/mcp
```
Set actor identity in shell: `export DXCRM_ACTOR=alice`

---

## dxcrm audit (Phase 3 — Audit Trail)

Show the append-only audit trail at `.agentic/audit.log`. Every `log_interaction` and `update_deal` call writes an attributed entry.

```bash
dxcrm audit                          # Last 20 entries
dxcrm audit --slug acme-corp         # Filter by customer
dxcrm audit --actor alice            # Filter by actor
dxcrm audit --limit 100              # Show more entries
```

**Options:**
- `--slug <slug>` — Filter by customer slug
- `--actor <actor>` — Filter by actor (matches `DXCRM_ACTOR`)
- `--limit <n>` — Number of entries (default: 20)

**Log format** (one line per entry):
```
2026-06-01T09:14:00Z | alice | log_interaction | acme-corp | Called about Q3 renewal
```

**Actor resolution**: `DXCRM_ACTOR` env var → `"system"`

---

## dxcrm rbac (Phase 4 — Role-Based Access Control)

Manage per-actor permissions. Roles are enforced at MCP tool call time.

```bash
dxcrm rbac set alice admin        # Assign role: admin | manager | rep
dxcrm rbac set bob rep
dxcrm rbac show                   # List all configured roles
dxcrm rbac check alice update_deal  # Exit 0 = allowed, exit 1 = denied
```

**Subcommands:**
- `set <actor> <role>` — Assign a role to an actor. Valid roles: `admin`, `manager`, `rep`
- `show` — List all configured roles from `.agentic/rbac.json`
- `check <actor> <tool>` — Check if actor can call tool (exits 0/1)

**Config file**: `.agentic/rbac.json`
```json
{ "actors": { "alice": "admin", "bob": "rep" }, "default": "rep" }
```

**Actor resolution**: `DXCRM_ACTOR` env var

**Permission matrix:**
| Role | log_interaction | update_deal | update_customer_facts | export_customer |
|---|---|---|---|---|
| admin | ✓ | ✓ | ✓ | ✓ |
| manager | ✓ | ✓ | — | — |
| rep | ✓ | ✓ | — | — |

---

## dxcrm gdpr (Phase 4 — GDPR Erasure)

Permanently erase a customer and all their data. Dry-run by default.

```bash
dxcrm gdpr erase acme-corp              # Dry-run: shows what would be deleted
dxcrm gdpr erase acme-corp --confirm    # Permanent deletion
dxcrm gdpr list-erasures                # Show all past erasures
```

**Subcommands:**
- `erase <slug> [--confirm]` — Delete customer directory. Without `--confirm`, prints plan only.
- `list-erasures` — Show `.agentic/gdpr-erasures.json`

**On confirmed erasure:**
1. Deletes `customers/<slug>/` recursively
2. Writes audit entry to `.agentic/audit.log`
3. Appends record to `.agentic/gdpr-erasures.json`

---

## dxcrm security-report (Phase 4 — Security Questionnaire)

Generate a Markdown security questionnaire covering data storage, auth, encryption, audit trail, network calls, GDPR controls, and SOC 2 readiness.

```bash
dxcrm security-report                           # Print to stdout
dxcrm security-report --output sec-report.md   # Write to file
```

**Options:**
- `--output <file>` — Write report to file instead of stdout

---

## dxcrm sync (Phase 1 + Phase 4)

Sync emails from Gmail or Microsoft Outlook.

```bash
dxcrm sync                                # Gmail sync (default)
dxcrm sync --provider gmail               # Explicit Gmail
dxcrm sync --provider microsoft           # Outlook via Microsoft Graph API
dxcrm sync --provider transcripts        # Unmatched transcripts
```

**Microsoft sync prerequisites:**
- Write access token to `.agentic/microsoft-token.json`:
  ```json
  { "accessToken": "ey..." }
  ```
- Token supports both `accessToken` (camelCase) and `access_token` (snake_case)

**sourceRef format**: `microsoft://message/<message-id>`

---

## dxcrm import (Phase 2 + Phase 4)

```bash
dxcrm import --from csv --file contacts.csv          # CSV import
dxcrm import --from transcripts --dir ./recordings   # Transcript import
dxcrm import --from salesforce --mode api \
  --token <access-token> \
  --url https://myco.salesforce.com                   # Salesforce REST API
```

**Pipedrive API import** (`--from pipedrive --mode api`):
- Fetches persons → customers (org_name or name as company), activities → interactions
- **sourceRef format**: `pipedrive://activity/<activity-id>`
- Env vars: `PIPEDRIVE_TOKEN`, `PIPEDRIVE_URL`

**Salesforce API import** (`--from salesforce --mode api`):
- Pass 1: fetches contacts → creates customer records (slug from email domain or Name)
- Pass 2: fetches tasks → creates interactions (linked via `WhoId`)
- **sourceRef format**: `salesforce://task/<task-id>`
- API version: v58.0 (SOQL via `/services/data/v58.0/query`)

---

## dxcrm backup / restore

```bash
dxcrm backup [./backup.zip]                    # Backup customers/ directory
dxcrm restore ./backup.zip                      # Restore from backup
dxcrm backup schedule --every day --keep 7      # Schedule daily backups, keep last 7
dxcrm backup schedule --status                  # Show current schedule
dxcrm backup schedule --clear                   # Remove backup schedule
```

**Backup schedule** is stored in `.agentic/config.json` and executed by the daemon (hourly check, runs if >1 day since last backup). Old backups are pruned automatically to keep only the last N.

---

## dxcrm stages

Manage custom pipeline stages stored in `.agentic/pipeline-stages.json`.

```bash
dxcrm stages list                                              # List all stages
dxcrm stages set discovery "Discovery" --order 3 --probability 40  # Create/update stage
dxcrm stages set negotiation "Negotiation" --color "#ffa657" --probability 75
dxcrm stages set signed "Signed" --final                       # Mark as terminal stage
dxcrm stages delete discovery                                  # Remove a stage
dxcrm stages reset                                             # Reset to 6 default stages
```

**Subcommands:**
- `list` — Print all stages with order, probability, and color
- `set <id> <label> [options]` — Create or update a stage
- `delete <id>` — Remove a stage by ID
- `reset` — Replace all stages with the built-in defaults (lead → qualified → proposal → negotiation → won → lost)

**Options for `set`:**
- `--order <n>` — Sort position in pipeline (default: last)
- `--probability <0-100>` — Default win probability percentage
- `--color <#hex>` — Display color (hex code)
- `--final` — Mark as a terminal stage (won/lost semantics)

**Default stages:**

| ID | Label | Order | Probability |
|---|---|---|---|
| `lead` | Lead | 1 | 10% |
| `qualified` | Qualified | 2 | 30% |
| `proposal` | Proposal | 3 | 50% |
| `negotiation` | Negotiation | 4 | 75% |
| `won` | Won | 5 | 100% |
| `lost` | Lost | 6 | 0% |

---

## dxcrm plugin

Manage the plugin registry.

```bash
dxcrm plugin list                  # List all registered plugins
dxcrm plugin info slack            # Show plugin details (name, version, description, tools)
```

**Subcommands:**
- `list` — Show all registered plugins with name, version, description
- `info <name>` — Show full plugin metadata including exposed MCP tools

**Built-in plugins** (register in code via `registerPlugin()`):

| Plugin | Package path | Adds |
|---|---|---|
| `slack` | `src/plugins/slack.ts` | After-interaction Slack DM; after-deal Slack alert |
| `stripe` | `src/plugins/stripe.ts` | `get_stripe_context` MCP tool (customer revenue) |
| `linear` | `src/plugins/linear.ts` | `get_linear_issues` MCP tool (linked issues by customer) |

**Adding a custom plugin:**
```typescript
import { registerPlugin } from "datasynx-opencrm/dist/core/plugin-registry.js";

registerPlugin({
  name: "my-plugin",
  version: "1.0.0",
  description: "My custom plugin",
  mcpTools: [],
  onInstall: async () => { /* setup */ },
  onUninstall: async () => { /* teardown */ },
});
```

---

## dxcrm import (HubSpot v4 API)

Import contacts and activities directly from the HubSpot API (v4 Associations).

```bash
dxcrm import --from hubspot --mode api \
  --token $HUBSPOT_TOKEN
```

**What it imports:**
- Contacts → customers (email as primary ID, company name as customer name)
- Associated notes, calls, emails, meetings → interactions (fetched via v4 Associations API)
- Deduplication by `hubspot://contact/<id>` sourceRef

**Environment variables:**
- `HUBSPOT_TOKEN` — HubSpot private app token (or use `--token`)

**sourceRef formats:**
- Contacts: `hubspot://contact/<contact-id>`
- Notes: `hubspot://note/<engagement-id>`
- Calls: `hubspot://call/<engagement-id>`
- Emails: `hubspot://email/<engagement-id>`
- Meetings: `hubspot://meeting/<engagement-id>`

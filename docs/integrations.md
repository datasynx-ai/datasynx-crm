# Framework Integrations — Datasynx Agentic CRM

`dxcrm init` automatically detects and configures all supported frameworks.

---

## Claude Code

**Config:** `~/.claude.json` (User scope — applies to all projects)
**Harness:** `CLAUDE.md` in CRM root + `~/.claude/settings.json` (alwaysAllow)

```json
// ~/.claude.json
{
  "mcpServers": {
    "datasynx-opencrm": {
      "type": "stdio",
      "command": "/path/to/node",
      "args": ["/path/to/datasynx-opencrm/dist/mcp.js"]
    }
  }
}
```

No restart required.

---

## Claude Desktop

**Config (macOS):** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Config (Windows):** `%APPDATA%\Claude\claude_desktop_config.json`
**Config (Linux):** `~/.config/claude-desktop/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "datasynx-opencrm": {
      "command": "/path/to/node",
      "args": ["/path/to/datasynx-opencrm/dist/mcp.js"]
    }
  }
}
```

**Restart Claude Desktop** to activate.

---

## Codex CLI

**Config:** `~/.codex/config.toml` (section appended, idempotent)

```toml
[mcp_servers.datasynx-opencrm]
command = "/path/to/node"
args = ["/path/to/dist/mcp.js"]
startup_timeout_sec = 30
tool_timeout_sec = 120
enabled = true
```

**Harness:** `AGENTS.md` in CRM root.

---

## OpenClaw

**Config:** `~/.openclaw/openclaw.json` (hot-reload, no restart)

Both stdio and HTTP entries registered. HTTP entry disabled by default
(activate when running `dxcrm mcp start --http`).

**Harness:** `SOUL.md` + `AGENTS.md` + `TOOLS.md` in CRM root.

---

## Hermes Agent

**Config:** `~/.hermes/config.yaml`
**Server name:** `datasynx_opencrm` (underscore — avoids tool prefix issues)

**Harness:** SOUL.md injection (appends CRM section if not present) + skill file
at `~/.hermes/skills/datasynx-crm.md`.

---

## Antigravity CLI (`agy`)

**Config:** `~/.gemini/config/mcp_config.json` (shared CLI + IDE)
**Note:** HTTP field is `serverUrl` (not `url` like all other frameworks)

**Harness:**
- `~/.gemini/GEMINI.md` (global, ≤50 lines)
- `AGENTS.md` in CRM root
- `~/.gemini/antigravity-cli/skills/datasynx-crm/SKILL.md`

---

## Cursor

**Config:** `~/.cursor/mcp.json`
**Harness:** `.cursor/rules/datasynx-crm.mdc` in CRM root (MDC format, alwaysApply: true)

Restart Cursor to activate.

---

## Windsurf

**Config:** `~/.codeium/windsurf/mcp_config.json`

No harness files. Restart Windsurf to activate.

---

## Cline

**Config:** `~/.cline/data/settings/cline_mcp_settings.json`

Always uses absolute paths. No harness files.

---

## HubSpot (API v4)

Import contacts and engagement history directly via the HubSpot API.

```bash
dxcrm import --from hubspot --mode api --token $HUBSPOT_TOKEN
```

Uses the **HubSpot v4 Associations API** to fetch notes, calls, emails, and meetings linked to each contact. Cursor-based pagination — handles accounts of any size. Rate-limit retry built in (10 req/s default).

**Required scope** on your HubSpot private app:
- `crm.objects.contacts.read`
- `crm.objects.engagements.read`
- `crm.associations.read`

---

## Google Drive

Sync Google Docs and Drive files into customer knowledge bases.

```bash
dxcrm sync --provider google-drive
```

**What it syncs:**
- Google Docs → exported as plain text, indexed in LanceDB for semantic search
- Drive files in folders matching the customer slug or domain
- Incremental: tracks `modifiedTime` to only re-fetch changed files

**Prerequisites:**
- `GOOGLE_SERVICE_ACCOUNT_KEY` env var (JSON key of service account with Drive read access)
- Or user OAuth: place token at `.agentic/google-drive-token.json`

**sourceRef format**: `gdrive://file/<file-id>`

---

## Microsoft Teams Transcripts

Sync meeting transcripts from Microsoft Teams via the Graph API.

```bash
dxcrm sync --provider teams-transcripts
```

**Prerequisites:**
- `.agentic/microsoft-token.json` with `{ "accessToken": "..." }`
- Token scope: `OnlineMeetings.Read` + `CallRecords.Read.All`

**sourceRef format**: `teams://transcript/<call-id>`

---

## Google Meet

Sync Google Meet transcripts via the Meet REST API v2.

```bash
dxcrm sync --provider google-meet
```

**Prerequisites:**
- `GOOGLE_SERVICE_ACCOUNT_KEY` with Meet API access
- Or user OAuth token at `.agentic/google-meet-token.json`

**sourceRef format**: `meet://transcript/<conference-id>`

---

## Manual Registration

If automatic detection doesn't work:

```bash
# Print the exact config entry for your framework:
dxcrm guide --framework claude-code
dxcrm guide --framework claude-desktop
dxcrm guide --framework codex
# etc.
```

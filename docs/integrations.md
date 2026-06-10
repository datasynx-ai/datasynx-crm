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

## Automatic Transcript Discovery & Routing (#56)

After every online call, the meeting summary can land on the right customer
**automatically** — no manual meeting/transcript IDs.

**How it works:**
- **Teams:** a Graph change-notification subscription on
  `communications/onlineMeetings/getAllTranscripts` hits the existing
  `POST /webhooks/microsoft` endpoint. Transcript notifications are detected,
  the meeting's attendee emails are resolved, and the email router maps them to
  a customer slug — then the existing Teams transcript sync runs for that slug.
- **Meet:** a Workspace-Events subscription for `transcript.fileGenerated`
  posts to `POST /webhooks/google`; the conference record id is extracted and
  routed the same way.
- **No match → unmatched queue:** transcripts whose attendees match no customer
  are queued, never silently dropped:

  ```bash
  dxcrm transcripts unmatched   # list transcripts that could not be routed
  dxcrm transcripts clear       # clear the queue after fixing main_facts
  ```

  Add the meeting domain/email to a customer's `main_facts` (`domain` / `email`
  / `primary_contact`) so the next event routes correctly.
- **Subscription renewal:** Microsoft Graph subscriptions (3-day expiry) are
  renewed automatically by the daemon's daily 06:00 job (alongside Gmail).
- **Event:** every routed transcript emits `meeting.transcribed`
  `{ slug, source: "teams" | "meet", sourceRef }` for workflow automation (#48).

Live subscription creation and attendee/transcript fetches are credential-gated
(require connected Graph/Workspace tokens). Without them the pipeline is a clean
no-op, consistent with the local-first model.

---

## Omnichannel Conversations Inbox (#57)

Unify inbound customer messages from the web-chat widget and WhatsApp into a
single, channel-spanning inbox. Threads are routed to a customer (by email via
the email router; phone/anonymous threads stay assignable), logged to the CRM
timeline, and can be replied to, assigned, closed, or escalated to a ticket.

### Web-chat widget

Embed the widget on any page — it POSTs messages to the CRM HTTP server:

```html
<script src="https://your-crm-host:3847/chat/widget.js" defer></script>
```

Messages land via `POST /chat` (`{ sessionId, email?, name?, message }`) and open
or continue a conversation keyed by the browser session.

**Two-way:** the widget polls `GET /chat/poll?sessionId=…&after=<cursor>` every
3 s for agent replies (`{ messages, cursor, status }`). Replies sent with
`dxcrm inbox reply` / `reply_conversation` reach the visitor automatically —
including a final answer sent with `--close`. Polling starts with the first
message (or immediately for returning sessions), so idle embeds are silent.

**Spam protection** (same model as `/forms`): a hidden honeypot field `_hp` —
non-empty submissions are silently dropped but look like a success to the bot —
plus per-IP rate limits: `POST /chat` 20/min, `GET /chat/poll` 120/min
(comfortable for one widget polling every 3 s). Over-limit requests get `429`.

### WhatsApp (Meta Cloud API)

Point your WhatsApp Business webhook at the CRM:

- **Verify (GET):** `GET /webhooks/whatsapp` echoes `hub.challenge` when
  `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN`.
- **Inbound (POST):** `POST /webhooks/whatsapp` — signature-checked with
  `WHATSAPP_APP_SECRET` (`X-Hub-Signature-256`); inbound texts open/continue a
  thread keyed by the sender's `wa_id`.
- **Outbound replies:** set `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` to deliver
  agent replies back via the Cloud API. Without them, replies are still recorded
  on the thread (local-first no-op).
- **Rate limit:** inbound POSTs are capped at 100/min per IP (`429` beyond) —
  abuse protection for setups where `WHATSAPP_APP_SECRET` is not configured.
  Always set the secret in production; the HMAC signature is the real
  authentication.

### Handling the inbox

```bash
dxcrm inbox list --status open       # triage open threads
dxcrm inbox show <id>                # read a transcript
dxcrm inbox reply <id> "On it!" --close
dxcrm inbox assign <id> --to alice --slug acme --escalate --title "Refund"
```

Or via MCP: `list_conversations`, `reply_conversation`, `assign_conversation`.

**Events** (workflow automation #48): `conversation.created`,
`conversation.message`, `conversation.replied`, `conversation.assigned`,
`conversation.escalated`.

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

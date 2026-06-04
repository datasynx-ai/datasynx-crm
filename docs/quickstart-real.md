# Quickstart — Real Gmail Account (5 Minutes)

This guide gets you from zero to a working CRM that auto-syncs your Gmail.

## Prerequisites

- Node.js 18+ installed
- A Google account
- Claude Code, Cursor, or another MCP-compatible agent framework

---

## Step 1 — Install

```bash
npm install -g @datasynx/agentic-crm
dxcrm --version
```

## Step 2 — Initialize Your CRM

Run in your project or home directory — this becomes your CRM data root:

```bash
mkdir ~/my-crm && cd ~/my-crm
dxcrm init
```

`dxcrm init` detects your agent framework (Claude Code, Cursor, Windsurf, etc.) and writes the MCP server config automatically.

## Step 3 — Connect Gmail

### 3a — Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → **APIs & Services** → **Enable APIs** → enable **Gmail API**
3. **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
4. Application type: **Desktop app**
5. Download JSON → save as `~/.agentic/gmail-credentials.json`

### 3b — Authorize dxcrm

```bash
dxcrm sync gmail --init
```

This opens a URL in your terminal. Visit it, authorize, paste the code back.  
Your token is saved to `~/.agentic/gmail-token.json` — keep it private.

### 3c — Configure Gmail Query per Customer

For each customer you want to track:

```bash
dxcrm create acme-corp --name "Acme Corp" --domain acme.com
dxcrm sync gmail --enable acme-corp --query "from:acme.com OR to:acme.com"
```

## Step 4 — Add Your First Customer

```bash
dxcrm create stripe --name "Stripe" --domain stripe.com
dxcrm sync gmail --enable stripe --query "from:stripe.com OR to:stripe.com"
```

Or via your agent:
```
Create a customer for Stripe (domain: stripe.com)
```

## Step 5 — Start the Background Daemon

The daemon syncs Gmail every 30 minutes and checks for deal risks daily:

```bash
dxcrm daemon start
dxcrm daemon status  # verify it's running
```

To auto-start on login, add to your shell profile:
```bash
# ~/.bashrc or ~/.zshrc
(cd ~/my-crm && dxcrm daemon start --quiet 2>/dev/null &)
```

## Step 6 — Ask Your Agent

Open Claude Code (or your agent) and ask:

```
What's going on with Stripe?
```

The agent calls `get_customer_context("stripe")` which triggers an immediate sync if data is >4 hours old.

```
Log a call with John at Stripe — discussed pricing, agreed to follow up next week
```

```
What's the pipeline forecast for this month?
```

## Step 7 — Schedule Backups (Optional)

```bash
dxcrm backup schedule --every day --keep 7
```

## Verify Everything Works

```bash
dxcrm status           # daemon running, customers synced, queue empty
dxcrm list             # list all customers
dxcrm show stripe      # show Stripe's profile
dxcrm audit            # recent write operations
```

---

## Troubleshooting

**"Gmail auth not configured"**
→ Run `dxcrm sync gmail --init` and complete the OAuth flow.

**"No customers directory found"**
→ You're in the wrong directory. `cd ~/my-crm` first.

**Daemon not starting**
→ Check `~/.dxcrm-daemon.log` for errors.

**Agent not seeing the MCP server**
→ Re-run `dxcrm init` in your CRM data directory. The framework config is written to your agent's settings file.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DXCRM_DATA_DIR` | `process.cwd()` | CRM data root |
| `TELEGRAM_BOT_TOKEN` | — | For agent wake notifications |
| `TELEGRAM_CHAT_ID` | — | Default Telegram chat for notifications |
| `ANTHROPIC_API_KEY` | — | Enables LLM email summaries (optional) |

---

## Next Steps

- [CLI Reference](cli-reference.md) — all commands
- [MCP Tools](mcp-tools.md) — agent tool reference
- [Team Setup](team-setup.md) — shared VM for multi-user

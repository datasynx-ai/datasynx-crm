# Quickstart — Real Gmail Account (5 Minutes)

This guide gets you from zero to a working CRM that auto-syncs your Gmail.

## Prerequisites

- Node.js 20+ installed
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

`dxcrm mailbox login` runs the Google OAuth flow for you and stores the token
locally. (Gmail requires OAuth for IMAP access in 2026 — passwords no longer work.)

```bash
dxcrm mailbox login gmail --user you@gmail.com
```

This opens a URL in your terminal. Visit it, authorize, and the token is saved
to `<your CRM root>/.agentic/` — keep that directory private. Confirm the
account is connected with:

```bash
dxcrm mailbox list   # shows logged-in accounts and token status
```

## Step 4 — Add Your First Customer

`dxcrm create` with `--domain` automatically configures the Gmail query for that
customer (`from:<domain> OR to:<domain>`), so mailbox sync can route mail to it:

```bash
dxcrm create "Stripe" --domain stripe.com
```

Or via your agent:
```
Create a customer for Stripe (domain: stripe.com)
```

Then sync the whole mailbox — messages are auto-routed to the right customer by
sender/recipient domain:

```bash
dxcrm mailbox sync --account gmail:you@gmail.com
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
dxcrm doctor                        # data integrity, temp files, logs, backups
dxcrm doctor --integrations --live  # per-provider readiness (tokens verified)
dxcrm status                        # daemon running, customers synced, queue empty
dxcrm list                          # list all customers
dxcrm nba stripe                    # next-best-action for Stripe
dxcrm audit                         # recent write operations
```

---

## Troubleshooting

**"Gmail auth not configured"**
→ Run `dxcrm mailbox login gmail --user you@gmail.com` and complete the OAuth flow.

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

Full list (live integrations, signing secrets, logging, privacy):
[Deployment → Environment Variables](deployment.md#environment-variables).

---

## Next Steps

- [CLI Reference](cli-reference.md) — all commands
- [MCP Tools](mcp-tools.md) — agent tool reference
- [Team Setup](team-setup.md) — shared VM for multi-user

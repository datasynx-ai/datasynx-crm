# Deployment Guide — Datasynx Agentic CRM

## Local (Single User)

```bash
npm install -g @datasynx/agentic-crm
dxcrm init
```

The MCP server runs as a stdio process — spawned on-demand by your AI framework.
No persistent server process needed for single-user use.

---

## Team / VM Setup (Phase 3 — Shared HTTP Server)

For teams sharing a central CRM instance on a VM.

### 1 — Provision VM

Hetzner CX21 (2 vCPU, 4GB RAM, €6/mo) is sufficient for up to 10 users.

```bash
# On the VM (Ubuntu 22.04 LTS):
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g @datasynx/agentic-crm

# Create data directory with shared volume:
mkdir -p /mnt/crm-data
dxcrm init  # run in /mnt/crm-data or set DXCRM_DATA_DIR
```

### 2 — Start HTTP MCP Server

```bash
# Start as detached process (writes PID to .agentic/server.pid):
dxcrm server start --data /mnt/crm-data --port 3847

# Check status:
dxcrm server status

# View audit trail:
dxcrm audit --limit 50
```

### 3 — Team Member Setup (each laptop)

```bash
npm install -g @datasynx/agentic-crm

# Configure all detected AI frameworks to use the shared server:
dxcrm init --team http://vm-ip:3847/mcp

# Set your identity (add to ~/.bashrc or ~/.zshrc):
export DXCRM_ACTOR=alice
```

Manual framework config (if `dxcrm init --team` doesn't detect your framework):
```json
{
  "mcpServers": {
    "datasynx-opencrm": {
      "url": "http://vm-ip:3847/mcp"
    }
  }
}
```

### 4 — Session Ownership

```bash
# Open a session as yourself:
dxcrm session open acme-corp --owner alice
# or with DXCRM_ACTOR set:
dxcrm session open acme-corp

# All teammates see who has which customer open via:
dxcrm status
```

---

## Systemd Service (Linux VM — Auto-restart)

```ini
# /etc/systemd/system/dxcrm.service
[Unit]
Description=Datasynx Agentic CRM MCP Server
After=network.target

[Service]
Type=simple
User=crm
WorkingDirectory=/mnt/crm-data
Environment=DXCRM_DATA_DIR=/mnt/crm-data
Environment=DXCRM_MCP_MODE=http
Environment=DXCRM_MCP_PORT=3847
ExecStart=/usr/local/bin/node /usr/local/lib/node_modules/@datasynx/agentic-crm/dist/mcp.js
Restart=on-failure
RestartSec=5
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now dxcrm
journalctl -u dxcrm -f  # Follow logs
```

---

## Audit Trail

Every write operation is logged to `.agentic/audit.log`:

```
2026-06-01T09:14:00Z | alice  | log_interaction | acme-corp | Called about Q3 renewal
2026-06-01T10:22:15Z | bob    | update_deal     | acme-corp | Enterprise License 2026
2026-06-01T11:00:00Z | system | log_interaction | beta-gmbh | Email received re invoice
```

```bash
dxcrm audit                      # Last 20 entries
dxcrm audit --slug acme-corp     # Filter by customer
dxcrm audit --actor alice        # Filter by actor
dxcrm audit --limit 100          # More entries
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DXCRM_DATA_DIR` | `process.cwd()` | CRM root directory |
| `DXCRM_MCP_MODE` | `stdio` | MCP transport: `stdio` or `http` |
| `DXCRM_MCP_PORT` | `3847` | HTTP server port |
| `DXCRM_ACTOR` | `system` | Identity for audit trail (set to your name) |
| `TELEGRAM_BOT_TOKEN` | — | Bot token for agent notifications |
| `TELEGRAM_CHAT_ID` | — | Default Telegram chat ID |
| `ANTHROPIC_API_KEY` | — | API key for LLM email summarization |
| `DXCRM_MCP_AUTH` | auto | HTTP `/mcp` auth: `required`, `off`, or auto (on once a token exists) |
| `DXCRM_PII_MASKING` | `off` | When `on`, mask emails/phones in text sent to the LLM (restored in responses) |
| `DXCRM_GUARDRAILS` | `off` | When `on`, neutralize prompt-injection phrases in untrusted content before LLM calls |

---

## Data Backup

```bash
# Manual backup
dxcrm backup ./backup-2026-05-25.zip

# Restore
dxcrm restore ./backup-2026-05-25.zip

# Scheduled backup (every day, keep last 7):
dxcrm backup schedule --every day --keep 7
dxcrm backup schedule --status

# Automated via crontab (alternative):
0 2 * * * DXCRM_DATA_DIR=/mnt/crm-data dxcrm backup /backups/crm-$(date +\%Y-\%m-\%d).zip
```

---

## Upgrading

```bash
npm update -g @datasynx/agentic-crm

# Re-run init to update harness files and MCP configs:
dxcrm init
# For team members:
dxcrm init --team http://vm-ip:3847/mcp
```

---

## Security Notes

- The HTTP MCP server supports **bearer-token authentication**. Mint a token with
  `dxcrm mcp token --actor alice --role admin` (printed once; only its SHA-256 hash is stored in
  `.agentic/mcp-tokens.json`). Once any token exists, `/mcp` requires `Authorization: Bearer <token>`
  and returns `401` with RFC 9728 `WWW-Authenticate` metadata otherwise. Force on/off with
  `DXCRM_MCP_AUTH=required|off`.
- Defense in depth: still restrict port 3847 to a private VPN / Tailscale network where possible.
- Audit log is append-only — `fs.appendFileSync` is atomic for lines <4096 bytes on Linux.
- RBAC (admin/manager/rep) is enforced per tool; a token's actor drives the role on HTTP requests.

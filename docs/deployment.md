# Deployment Guide — DatasynxOpenCRM

## Local (Single User)

```bash
npm install -g datasynx-opencrm
dxcrm init
```

The MCP server runs as a stdio process — spawned on-demand by your AI framework.
No persistent server process needed for single-user use.

---

## Team / VM Setup (Shared HTTP Server)

For teams sharing a central CRM instance:

```bash
# On the VM:
npm install -g datasynx-opencrm

# Start persistent HTTP server (StreamableHTTP transport):
dxcrm mcp start --http --port 3847

# Team members configure their frameworks to use HTTP:
# URL: http://<vm-ip>:3847/mcp
```

**Note:** HTTP transport uses StreamableHTTP (SSE is deprecated since March 2025).

---

## Systemd Service (Linux VM)

```ini
# /etc/systemd/system/dxcrm.service
[Unit]
Description=DatasynxOpenCRM MCP Server
After=network.target

[Service]
Type=simple
User=crm
WorkingDirectory=/opt/crm-data
ExecStart=/usr/local/bin/node /usr/local/lib/node_modules/datasynx-opencrm/dist/mcp.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now dxcrm
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DXCRM_DATA_DIR` | `process.cwd()` | CRM root directory |
| `DXCRM_HTTP_PORT` | `3847` | HTTP server port |
| `DXCRM_LOG_LEVEL` | `info` | Log level (debug/info/warn/error) |
| `HERMES_HOME` | `~/.hermes` | Hermes config directory |

---

## Data Backup

```bash
# Manual backup
dxcrm backup ./backup-2026-05-25.zip

# Restore
dxcrm restore ./backup-2026-05-25.zip

# Automated daily backup (crontab):
0 2 * * * /usr/local/bin/dxcrm backup /backups/crm-$(date +\%Y-\%m-\%d).zip
```

---

## Upgrading

```bash
npm update -g datasynx-opencrm

# Re-run init to update harness files and MCP configs:
dxcrm init
```

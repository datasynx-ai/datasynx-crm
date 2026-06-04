# Team Setup Guide — Datasynx Agentic CRM

## Overview

Datasynx Agentic CRM supports shared team access via a central HTTP MCP server on a VM. Each team member connects their AI framework to the shared server. All writes are serialized per customer file; the audit trail tracks who did what.

## Prerequisites

- A Linux VM (e.g., Hetzner CX21: 2 vCPU, 4 GB RAM) — see [deployment.md](./deployment.md)
- Node.js 18+ on the VM
- `@datasynx/agentic-crm` installed globally: `npm install -g @datasynx/agentic-crm`

---

## 1. Start the Shared Server (VM)

```bash
# On the VM — start the MCP HTTP server
export DXCRM_DATA_DIR=/mnt/crm-data
dxcrm server start --data /mnt/crm-data --port 3847

# Check status
dxcrm server status

# As a systemd service (recommended for production)
# See deployment.md for the full systemd unit
```

The server writes its PID to `/mnt/crm-data/.agentic/server.pid`.

---

## 2. Set Up Roles (Admin Only)

Roles control which MCP tools each team member can call. Run these on the VM as a one-time setup:

```bash
dxcrm rbac set alice admin      # Full access
dxcrm rbac set bob manager      # log_interaction + update_deal
dxcrm rbac set carol rep        # log_interaction only
dxcrm rbac show                 # Verify
```

**Permission matrix:**

| Role | log_interaction | update_deal | update_customer_facts | export_customer |
|---|---|---|---|---|
| `admin` | ✓ | ✓ | ✓ | ✓ |
| `manager` | ✓ | ✓ | — | — |
| `rep` | ✓ | — | — | — |

Default role (no entry in rbac.json): `rep`

---

## 3. Configure Each Team Member's AI Framework

Each team member adds the server URL to their framework config. The `dxcrm init --team <url>` command automates this:

```bash
# On each team member's machine
dxcrm init --team http://vm-ip:3847/mcp
```

Or manually:

### Claude Code (`~/.claude.json`)
```json
{
  "mcpServers": {
    "datasynx-opencrm": {
      "type": "http",
      "url": "http://vm-ip:3847/mcp"
    }
  }
}
```

### Codex CLI (`~/.codex/config.yaml`)
```yaml
mcpServers:
  datasynx-opencrm:
    type: http
    url: http://vm-ip:3847/mcp
```

### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "datasynx-opencrm": {
      "url": "http://vm-ip:3847/mcp"
    }
  }
}
```

---

## 4. Set Actor Identity (Each Team Member)

Add to shell profile (`~/.bashrc`, `~/.zshrc`):

```bash
export DXCRM_ACTOR=alice
```

The MCP server reads this env var from the HTTP request context. Every `log_interaction` and `update_deal` call is attributed to this actor in the audit log.

---

## 5. Verify Connection

```bash
# Ask the AI agent
"List my customers"
"Get capabilities"

# Or directly via CLI (if CRM data is local)
dxcrm list
```

---

## Audit Trail

Every write operation is logged to `.agentic/audit.log` on the VM:

```
2026-06-01T09:14:00Z | alice | log_interaction | acme-corp | Called about Q3 renewal
2026-06-01T10:22:00Z | bob   | update_deal     | beta-gmbh  | Stage → Closed Won
```

To review:

```bash
dxcrm audit                          # Last 20 entries (run on VM or with shared data)
dxcrm audit --actor alice            # Filter by team member
dxcrm audit --slug acme-corp         # Filter by customer
dxcrm audit --limit 100
```

---

## Concurrent Writes

Datasynx Agentic CRM uses a per-file write queue (`withFileQueue`) to serialize concurrent writes to the same customer's `interactions.md`. No locking library required — the queue is in-process on the shared server.

---

## GDPR Erasure (Admin Only)

```bash
# Dry-run first (always)
dxcrm gdpr erase acme-corp

# Permanent deletion after review
dxcrm gdpr erase acme-corp --confirm

# Audit log
dxcrm gdpr list-erasures
```

---

## Security Notes

- The HTTP server has no built-in authentication — run behind a VPN or SSH tunnel in production
- RBAC is enforced per MCP tool call (not at the HTTP layer)
- Token files (`.agentic/microsoft-token.json`) must be readable by the server process
- See [deployment.md](./deployment.md) for firewall and systemd configuration

# Deployment Guide — Datasynx Agentic CRM

## Local (Single User)

```bash
# ONNXRUNTIME_NODE_INSTALL=skip keeps the install CPU-only and ~302 MB lighter
# (see "Install Footprint" below). Drop the prefix if you want the GPU runtime.
ONNXRUNTIME_NODE_INSTALL=skip npm install -g @datasynx/agentic-crm
dxcrm init
```

`dxcrm init` also seeds starter email templates and one example sequence so
template-driven outreach works immediately. They are clearly-labeled examples
(`starter: true`) and can be edited or deleted; a deleted starter is not recreated
on a later `init`.

The MCP server runs as a stdio process — spawned on-demand by your AI framework.
No persistent server process needed for single-user use.

---

## Install Footprint & Native Build Requirements

`npm install` runs lifecycle scripts for a few native dependencies. On a typical
Linux/macOS box with prebuilt binaries available this is automatic and needs no
system packages, but it is worth knowing what runs and why:

| Package | Install-time work | Powers |
|---|---|---|
| `sharp` | builds/links **libvips** (uses a prebuilt binary when one matches your platform) | image preprocessing for local embeddings |
| `onnxruntime-node` | downloads the native **ONNX runtime** binary (~tens of MB) | running the local embedding model |
| `protobufjs` | protobuf codegen postinstall | ONNX model loading (via `onnxruntime-web`) |
| `tesseract.js` | OpenCollective funding notice only (no native build) | OCR for image/scanned-PDF attachments |

Additional runtime (not install-time) footprint:

- **Embedding model** — the default `Xenova/all-MiniLM-L6-v2` (~25 MB) is
  downloaded on first use and cached under `~/.cache/datasynx-opencrm/models`
  (override with `HF_CACHE_DIR`). See `docs/embeddings.md`.
- **PDF OCR** — disabled by default. Enabling it (`DXCRM_PDF_OCR=1`) additionally
  requires the optional `@napi-rs/canvas` peer (`npm install @napi-rs/canvas`).

Notes for self-hosters and CI:

- Install scripts are **not** disabled (`--ignore-scripts` would break the native
  embeddings/OCR binaries). The set of packages allowed to run install scripts is
  pinned and enforced by `npm run check:install-scripts` (see `CONTRIBUTING.md`).
- CI uses prebuilt binaries; an air-gapped host without network access at install
  time cannot fetch the ONNX runtime binary or the embedding model.
- Two deprecated upstream-only transitives (`boolean`, `node-domexception`) are
  knowingly accepted and tracked in issue #87; `npm audit` reports 0
  vulnerabilities on the full tree.

### Real install size — and how to cut it ~40%

A fresh production install resolves roughly **350 packages and ~1 GB on disk**.
Almost all of that weight is native binaries and bundled runtimes, not
JavaScript. Approximate sizes on a single CPU Linux/macOS host:

| Package | Approx. size | Needed for a CPU install? |
|---|---|---|
| `onnxruntime-node` — bundled CPU runtime | ~200 MB | **Yes** — the local embedding runtime |
| `onnxruntime-node` — **CUDA GPU provider (downloaded on install)** | **~302 MB** | **No** — GPU-only; downloaded by default even without a GPU |
| `@lancedb/lancedb` (platform binary) | ~150 MB | **Yes** — the vector store |
| `onnxruntime-web` | ~131 MB | **No** — a browser/WASM runtime; never loaded by dxcrm |
| `tesseract.js-core` | ~44 MB | Only when PDF/image OCR runs (`DXCRM_PDF_OCR=1`) |
| `@img`/libvips (via `sharp`) | ~17–33 MB | Image preprocessing for embeddings |

The two largest reducible items are GPU/browser runtimes that dxcrm never loads.

#### Recommended: a CPU-only install (saves ~302 MB)

`onnxruntime-node` downloads a **~302 MB CUDA execution provider** from its
post-install script — by default, on Linux, *even on a machine with no GPU*. The
CUDA binaries are not bundled in the npm package; they are fetched at install
time. dxcrm runs embeddings on CPU and never loads the CUDA provider, so skipping
that download is safe and leaves the bundled CPU runtime fully working. This is
`onnxruntime-node`'s own supported flag:

```bash
# Prefix the install (one-off):
ONNXRUNTIME_NODE_INSTALL=skip npm install -g @datasynx/agentic-crm

# Or persist it for a host / CI by exporting the env var before installing:
export ONNXRUNTIME_NODE_INSTALL=skip
```

Use the **environment variable**, not an `.npmrc` key — recent npm warns about
and is dropping unknown project-config keys. Verify afterwards with
`dxcrm doctor` and one real indexing/search call (which exercises the CPU
embedding runtime).

#### Advanced (at your own risk): also prune `onnxruntime-web` (saves ~131 MB)

`onnxruntime-web` is a hard (non-optional) transitive dependency of
`@huggingface/transformers`, so it installs for everyone even though the dxcrm
Node runtime only ever loads `onnxruntime-node`. A CI guard
(`npm run check:onnx-web`, issue #93) asserts the transformers Node bundle never
imports it. We cannot prune it for you — npm `overrides` apply only at the
install root, not when a package is installed as a dependency (see issue #92) —
but on a Node-only deployment you can override it with an empty stub **in your
own project's root `package.json`** (overrides do apply at your install root):

```bash
# 1. Create a one-line empty stub next to your package.json:
mkdir -p onnxruntime-web-stub
echo '{"name":"onnxruntime-web","version":"0.0.0"}' > onnxruntime-web-stub/package.json
```

```jsonc
// 2. In your root package.json, then reinstall:
"overrides": { "onnxruntime-web": "file:./onnxruntime-web-stub" }
```

This recipe is **not shipped or tested in our CI**. It would break any
browser/WASM use of `@huggingface/transformers` (which dxcrm does not do). After
applying it, verify with `dxcrm doctor` and a real indexing/search call.

Together these two steps take a CPU Linux install from ~1 GB to roughly
**550–600 MB** with no loss of functionality.

---

## Team / VM Setup (Phase 3 — Shared HTTP Server)

For teams sharing a central CRM instance on a VM.

### 1 — Provision VM

Hetzner CX21 (2 vCPU, 4GB RAM, €6/mo) is sufficient for up to 10 users.

```bash
# On the VM (Ubuntu 22.04 LTS):
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
# CPU-only install (skips the ~302 MB CUDA download; see "Install Footprint"):
ONNXRUNTIME_NODE_INSTALL=skip npm install -g @datasynx/agentic-crm

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

> Check what's actually wired up with `dxcrm doctor --integrations [--live]` —
> it reports per-provider readiness with a concrete cause for every gap.

### Core

| Variable | Default | Description |
|---|---|---|
| `DXCRM_DATA_DIR` | `process.cwd()` | CRM root directory |
| `DXCRM_PUBLIC_URL` | — | Public base URL of this server — required for webhooks, the chat widget, booking/portal links and `dxcrm transcripts subscribe` |
| `DXCRM_MCP_MODE` | `stdio` | MCP transport: `stdio` or `http` |
| `DXCRM_MCP_PORT` | `3847` | HTTP server port |
| `DXCRM_MCP_AUTH` | auto | HTTP `/mcp` auth: `required`, `off`, or auto (on once a token exists) |
| `DXCRM_ACTOR` | `system` | Identity for audit trail (set to your name) |
| `DXCRM_VAULT_KEY` | — | Master key for the encrypted credential vault (`.agentic/vault.enc`) |
| `DXCRM_DAEMON_INTERVAL` | `30` | Background sync interval (minutes) |

### LLM & search

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | API key for LLM email summarization |
| `DXCRM_LLM_PROVIDER` / `DXCRM_LLM_MODEL` / `DXCRM_LLM_BASE_URL` | anthropic | Alternative LLM endpoint for summarization |
| `DXCRM_EMBED_MODEL` | `Xenova/all-MiniLM-L6-v2` | Embedding model (see `docs/embeddings.md`; reindex after switching) |

### Live integrations (see `docs/integrations.md` for setup)

| Variable | Used by |
|---|---|
| `WHATSAPP_TOKEN` · `WHATSAPP_PHONE_ID` · `WHATSAPP_APP_SECRET` · `WHATSAPP_VERIFY_TOKEN` | WhatsApp Cloud API inbox (#57): inbound verification, signature check, outbound replies |
| `MS_GRAPH_CLIENT_STATE` | Microsoft Graph webhook verification + `dxcrm transcripts subscribe teams` |
| `GMAIL_PUBSUB_TOKEN` | Gmail Pub/Sub push webhook auth |
| `SLACK_BOT_TOKEN` · `SLACK_SIGNING_SECRET` · `SLACK_WEBHOOK_URL` | Slack events + notifications |
| `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` | Per-customer agent notifications |
| `STRIPE_API_KEY` · `STRIPE_WEBHOOK_SECRET` | Quote payment links + paid events (#49) |
| `WORKOS_API_KEY` | SSO for the shared team server |
| `DXCRM_GOOGLE_CLIENT_ID/SECRET` · `DXCRM_MS_CLIENT_ID` · `DXCRM_MS_TENANT` | Mailbox OAuth flows (`dxcrm mailbox connect`) |
| `CLEARBIT_API_KEY` · `CRUNCHBASE_API_KEY` · `CALENDLY_API_KEY` | Enrichment / scheduling lookups |
| `PIPEDRIVE_TOKEN/URL` · `SFDC_TOKEN/URL` | CRM imports |

### Token-signing secrets (set in production — defaults are dev-only)

| Variable | Signs |
|---|---|
| `DXCRM_FORMS_SECRET` | Double-opt-in confirm links |
| `DXCRM_BOOKING_SECRET` | Booking page embed links |
| `DXCRM_SURVEY_SECRET` | NPS/CSAT survey links |
| `DXCRM_DASHBOARD_SECRET` | Read-only dashboard links |
| `DXCRM_TRACKING_SECRET` | Email open/click tracking tokens (`DXCRM_EMAIL_TRACKING=opens|clicks|all`) |

### Privacy, logging & misc

| Variable | Default | Description |
|---|---|---|
| `DXCRM_PII_MASKING` | `off` | When `on`, mask emails/phones in text sent to the LLM (restored in responses) |
| `DXCRM_GUARDRAILS` | `off` | When `on`, neutralize prompt-injection phrases in untrusted content before LLM calls |
| `DXCRM_AI_DISCLOSURE` / `DXCRM_AI_DISCLOSURE_LANG` | `off` / `en` | Append an AI-assistance disclosure to outbound drafts |
| `DXCRM_LOG_LEVEL` / `DXCRM_LOG_MAX_BYTES` / `DXCRM_LOG_MAX_FILES` / `DXCRM_LOG_STDERR` | info | Structured logging (`.agentic/logs.ndjson`) |
| `DXCRM_PDF_OCR` / `DXCRM_OCR_LANG` / `DXCRM_PDF_OCR_MAX_PAGES` | off | OCR for scanned attachments |
| `DXCRM_VAULT_GUI_ALLOW_REMOTE` | `0` | Allow the vault GUI behind a trusted reverse proxy (loopback-only by default) |
| `DXCRM_SNAPSHOT_KEEP` / `DXCRM_STALLED_DAYS` | 90 / 14 | Pipeline snapshot retention (days) / stalled-deal threshold |

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

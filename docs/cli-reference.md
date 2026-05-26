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

Sync Gmail and transcripts for a customer.

```bash
dxcrm sync <slug> [--since <YYYY-MM-DD>]
```

**Options:**
- `--since <date>` — Only sync emails/transcripts after this date

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

## dxcrm backup / restore

```bash
dxcrm backup [./backup.zip]     # Backup customers/ directory
dxcrm restore ./backup.zip       # Restore from backup
```

# Framework Integrations — DatasynxOpenCRM

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

## Manual Registration

If automatic detection doesn't work:

```bash
# Print the exact config entry for your framework:
dxcrm guide --framework claude-code
dxcrm guide --framework claude-desktop
dxcrm guide --framework codex
# etc.
```

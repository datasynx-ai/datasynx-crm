import { Command } from "commander";
import fs from "fs";
import path from "path";
import { success } from "../ui/colors.js";

const REPORT = `# DatasynxOpenCRM — Security Report

Generated: ${new Date().toISOString().slice(0, 10)}

## 1. Data Storage

- **Location**: Local filesystem only. All data lives in \`customers/\` and \`.agentic/\` directories on your infrastructure.
- **External transmission**: None by default. Data is never sent to Datasynx servers.
- **Cloud dependencies**: None for core functionality. Optional integrations (Gmail, Anthropic API) are explicitly configured.

## 2. Authentication & Authorization

- **Phase 3**: No authentication on HTTP MCP server. Restrict access via firewall or VPN (port 3847 should be on private network only).
- **Phase 4 (RBAC)**: Role-based access control via \`.agentic/rbac.json\`. Roles: admin, manager, rep. Enforced per MCP tool call.
- **Actor identity**: \`DXCRM_ACTOR\` environment variable. No cryptographic identity in Phase 3.

## 3. Encryption

- **At rest**: Not encrypted at application level. Use OS-level disk encryption (LUKS on Linux, FileVault on macOS).
- **In transit**: HTTP (no TLS) in Phase 3. Use a reverse proxy (nginx + Let's Encrypt) or VPN for TLS.
- **Recommendation**: Deploy behind Tailscale or WireGuard for team access.

## 4. Audit Trail

- **File**: \`.agentic/audit.log\` — append-only, one line per entry.
- **Format**: \`timestamp | actor | tool | customer | summary\`
- **Coverage**: All write operations (\`log_interaction\`, \`update_deal\`, \`gdpr_erase\`).
- **Tamper evidence**: Phase 3: none. Phase 4+: hash chaining planned.
- **Retention**: Indefinite (append-only, never deleted by the application).

## 5. Network Calls

The following external services are contacted when configured:

| Service | When | Data sent |
|---|---|---|
| Gmail API | Gmail sync enabled + credentials configured | Email headers + snippets |
| Anthropic API | \`ANTHROPIC_API_KEY\` set | Email/transcript content for summarization |
| Telegram Bot API | Agent notifications enabled + token set | Customer slug + context excerpt (≤800 chars) |
| Microsoft Graph | Microsoft sync configured | Email headers + snippets |

**No telemetry, no analytics, no usage data is sent to Datasynx.**

## 6. Data Residency

DatasynxOpenCRM runs entirely on customer-controlled infrastructure. Data never leaves the deployment environment without explicit integration configuration.

This makes EU data residency guarantees straightforward — a key differentiator vs cloud CRMs.

## 7. GDPR Compliance

- **Right to erasure (Art. 17)**: \`dxcrm gdpr erase <slug> --confirm\` permanently deletes all customer data.
- **Erasure log**: \`.agentic/gdpr-erasures.json\` records what was deleted, when, and by whom.
- **Audit trail**: Every write operation is attributed to an actor.
- **Data portability (Art. 20)**: \`dxcrm export <slug>\` exports all data as JSON or Markdown.

## 8. SOC 2 Readiness

- **Audit log**: Available from Phase 3 (audit trail covers all write operations).
- **SOC 2 Type 2**: Requires 6 months of consistent audit logs. Apply after Phase 4 completion.
- **Security review questionnaire**: This document serves as the primary answer document.

## 9. Dependencies (Key Packages)

| Package | Purpose | Cloud dependency? |
|---|---|---|
| \`@modelcontextprotocol/sdk\` | MCP server | No |
| \`@googleapis/gmail\`, \`@googleapis/calendar\` | Gmail/Calendar sync | Optional — only if configured |
| \`@anthropic-ai/sdk\` | LLM summarization | Optional — only if API key set |
| \`lancedb\` | Local vector search | No — embedded DB |
| \`gray-matter\` | Markdown frontmatter | No |
| \`commander\` | CLI framework | No |
| \`zod\` | Schema validation | No |
| \`cron\` | Background sync | No |

## 10. Incident Response

- **Data breach**: Filesystem-only — scope is limited to the deployment host.
- **Revoke access**: Remove actor from \`.agentic/rbac.json\`, rotate \`DXCRM_ACTOR\` env var.
- **Audit**: \`dxcrm audit --actor <actor>\` shows all actions by a specific user.
`;

export async function runSecurityReport(
  opts: { output?: string },
  _dataDir?: string
): Promise<void> {
  const report = REPORT;

  if (opts.output) {
    const outputPath = path.resolve(opts.output);
    fs.writeFileSync(outputPath, report, "utf-8");
    console.log(success(`✓ Security report written to: ${outputPath}`));
  } else {
    console.log(report);
  }
}

export const securityReportCommand = new Command("security-report")
  .description("Generate security questionnaire answer document for enterprise reviews")
  .option("--output <file>", "Write report to file instead of stdout")
  .action((opts: { output?: string }) => runSecurityReport(opts, process.env["DXCRM_DATA_DIR"]));

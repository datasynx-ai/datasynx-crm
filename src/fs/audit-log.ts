import fs from "fs";
import path from "path";

export interface AuditEntry {
  timestamp: string; // ISO 8601
  actor: string; // DXCRM_ACTOR env var, or "system"
  tool: string; // "log_interaction" | "update_deal" | "update_customer_facts" | etc.
  slug: string; // customer slug
  summary: string; // short description (first 120 chars of summary/deal name)
}

// File format (one line per entry, append-only):
// 2026-06-01T09:14:00Z | alice | log_interaction | acme-corp | Called about Q3 renewal...

const AUDIT_LOG_PATH = ".agentic/audit.log";

export function getActor(): string {
  const actor = process.env["DXCRM_ACTOR"];
  return actor && actor.trim().length > 0 ? actor.trim() : "system";
}

export function writeAuditEntry(dataDir: string, entry: AuditEntry): void {
  const logPath = path.join(dataDir, AUDIT_LOG_PATH);
  const logDir = path.dirname(logPath);

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const truncatedSummary = entry.summary.slice(0, 120);
  const line = `${entry.timestamp} | ${entry.actor} | ${entry.tool} | ${entry.slug} | ${truncatedSummary}\n`;

  fs.appendFileSync(logPath, line, "utf-8");
}

export function readAuditLog(dataDir: string): AuditEntry[] {
  const logPath = path.join(dataDir, AUDIT_LOG_PATH);

  if (!fs.existsSync(logPath)) {
    return [];
  }

  const content = fs.readFileSync(logPath, "utf-8") as string;
  const lines = content.split("\n");

  const entries: AuditEntry[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(" | ");
    if (parts.length < 5) continue;

    const [timestamp, actor, tool, slug, ...summaryParts] = parts;
    const summary = summaryParts.join(" | ");

    if (timestamp && actor && tool && slug) {
      entries.push({ timestamp, actor, tool, slug, summary: summary ?? "" });
    }
  }

  return entries;
}

export function filterAuditLog(
  entries: AuditEntry[],
  opts: { slug?: string; actor?: string; limit?: number }
): AuditEntry[] {
  let filtered = entries;

  if (opts.slug !== undefined) {
    filtered = filtered.filter((e) => e.slug === opts.slug);
  }

  if (opts.actor !== undefined) {
    filtered = filtered.filter((e) => e.actor === opts.actor);
  }

  if (opts.limit !== undefined) {
    filtered = filtered.slice(-opts.limit);
  }

  return filtered;
}

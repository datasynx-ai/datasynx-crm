import { Command } from "commander";
import { readAuditLog, filterAuditLog } from "../fs/audit-log.js";

const SEP = "─".repeat(70);

export async function runAudit(
  opts: {
    slug?: string;
    actor?: string;
    limit?: number;
    tail?: boolean;
  },
  dataDir?: string
): Promise<void> {
  const dir = dataDir ?? process.cwd();
  const limit = opts.limit ?? 20;

  const allEntries = readAuditLog(dir);
  const entries = filterAuditLog(allEntries, {
    ...(opts.slug !== undefined ? { slug: opts.slug } : {}),
    ...(opts.actor !== undefined ? { actor: opts.actor } : {}),
    limit,
  });

  console.log(SEP);
  console.log(" DatasynxOpenCRM — Audit Trail");

  if (opts.slug) console.log(` Customer: ${opts.slug}`);
  if (opts.actor) console.log(` Actor:    ${opts.actor}`);

  console.log(SEP);

  if (entries.length === 0) {
    console.log(" No audit entries found.");
    console.log(SEP);
    return;
  }

  for (const entry of entries) {
    console.log(
      ` ${entry.timestamp}  ${entry.actor.padEnd(12)}  ${entry.tool.padEnd(20)}  ${entry.slug.padEnd(20)}  ${entry.summary}`
    );
  }

  console.log(SEP);
  console.log(` ${entries.length} entr${entries.length === 1 ? "y" : "ies"} shown`);
  console.log(SEP);
}

export const auditCommand = new Command("audit")
  .description("Show CRM audit trail — who changed what and when")
  .option("--slug <slug>", "Filter by customer slug")
  .option("--actor <actor>", "Filter by actor")
  .option("--limit <n>", "Number of entries to show (default: 20)", parseInt)
  .option("--tail", "Show all new entries (simplified: shows current entries)")
  .action((opts: { slug?: string; actor?: string; limit?: number; tail?: boolean }) =>
    runAudit(opts)
  );

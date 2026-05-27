import { Command } from "commander";
import fs from "fs";
import path from "path";
import { success, error, info, bold } from "../ui/colors.js";
import { writeAuditEntry, getActor } from "../fs/audit-log.js";

interface ErasureRecord {
  slug: string;
  erasedAt: string;
  erasedBy: string;
  reason: string;
}

function erasuresPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "gdpr-erasures.json");
}

function readErasures(dataDir: string): ErasureRecord[] {
  const p = erasuresPath(dataDir);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8") as string) as ErasureRecord[];
  } catch {
    return [];
  }
}

function appendErasure(dataDir: string, record: ErasureRecord): void {
  const p = erasuresPath(dataDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const existing = readErasures(dataDir);
  existing.push(record);
  fs.writeFileSync(p, JSON.stringify(existing, null, 2), "utf-8");
}

export async function runGdprErase(
  slug: string,
  opts: { confirm?: boolean },
  dataDir?: string
): Promise<void> {
  const dir = dataDir ?? process.cwd();
  const customerDir = path.join(dir, "customers", slug);

  if (!opts.confirm) {
    console.log(info(`Dry run — would permanently erase: ${bold(slug)}`));
    console.log(info(`  Directory: ${customerDir}`));
    console.log(info(`  Audit log entry will be written to .agentic/audit.log`));
    console.log(info(`  Erasure record will be added to .agentic/gdpr-erasures.json`));
    console.log(info(`\n  To proceed: dxcrm gdpr erase ${slug} --confirm`));
    return;
  }

  if (!fs.existsSync(customerDir)) {
    console.warn(info(`  Customer '${slug}' directory not found — may already be erased.`));
  } else {
    fs.rmSync(customerDir, { recursive: true, force: true });
    try {
      const { dropCustomerTable } = await import("../core/lancedb.js");
      await dropCustomerTable(dir, slug);
    } catch {
      // non-critical — lancedb cleanup failure should not block erasure
    }
  }

  const actor = getActor();
  const now = new Date().toISOString();

  writeAuditEntry(dir, {
    timestamp: now,
    actor,
    tool: "gdpr_erase",
    slug,
    summary: "Customer data permanently erased",
  });

  appendErasure(dir, {
    slug,
    erasedAt: now,
    erasedBy: actor,
    reason: "GDPR Art. 17 request",
  });

  console.log(success(`✓ Customer '${bold(slug)}' erased.`));
  console.log(info(`  Deletion logged to .agentic/audit.log`));
  console.log(info(`  Record added to .agentic/gdpr-erasures.json`));
}

export async function runGdprListErasures(dataDir?: string): Promise<void> {
  const dir = dataDir ?? process.cwd();
  const records = readErasures(dir);

  if (records.length === 0) {
    console.log(info("No erasures on record."));
    return;
  }

  console.log(bold(`\n GDPR Erasures (${records.length})\n`));
  for (const r of records) {
    console.log(info(`  ${r.erasedAt}  ${r.erasedBy.padEnd(12)}  ${r.slug}  — ${r.reason}`));
  }
  console.log("");
}

export const gdprCommand = new Command("gdpr").description("GDPR compliance tools");

gdprCommand
  .command("erase <slug>")
  .description("Permanently erase all data for a customer (Art. 17 right to erasure)")
  .option("--confirm", "Confirm permanent deletion (required)")
  .action((slug: string, opts: { confirm?: boolean }) => runGdprErase(slug, opts));

gdprCommand
  .command("list-erasures")
  .description("Show history of GDPR erasures")
  .action(() => runGdprListErasures());

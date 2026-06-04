import { Command } from "commander";
import fs from "fs";
import path from "path";
import { writeJsonFile } from "../fs/json-store.js";
import { success, info, bold } from "../ui/colors.js";
import { writeAuditEntry, getActor } from "../fs/audit-log.js";
import { withJsonFile } from "../core/file-lock.js";

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
  writeJsonFile(p, existing);
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

  // Clean up .agentic/-level references to this slug

  // 1. Remove tasks for this slug from the global agent queue
  const globalQueuePath = path.join(dir, ".agentic", "agent-queue.json");
  if (fs.existsSync(globalQueuePath)) {
    await withJsonFile<unknown[]>(globalQueuePath, (tasks) =>
      (Array.isArray(tasks) ? tasks : []).filter((t) => (t as { slug?: string }).slug !== slug)
    );
  }

  // 2. Remove goal sub-goals referencing this slug
  const goalsPath = path.join(dir, ".agentic", "goals.json");
  if (fs.existsSync(goalsPath)) {
    const { readGoals, writeGoals } = await import("../core/goal-engine.js");
    const goals = readGoals(dir);
    const cleaned = goals.map((g) => ({
      ...g,
      decomposition: {
        ...g.decomposition,
        subGoals: g.decomposition.subGoals.filter((sg) => sg.slug !== slug),
      },
    }));
    writeGoals(dir, cleaned);
  }

  // 3. Revoke push subscriptions for this slug
  const { readSubscriptions, writeSubscriptions } = await import("../sync/push-manager.js");
  const subs = await readSubscriptions(dir);
  const remaining = subs.filter((s) => s.slug !== slug);
  if (remaining.length !== subs.length) {
    await writeSubscriptions(dir, remaining);
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
  .action((slug: string, opts: { confirm?: boolean }) =>
    runGdprErase(slug, opts, process.env["DXCRM_DATA_DIR"])
  );

gdprCommand
  .command("list-erasures")
  .description("Show history of GDPR erasures")
  .action(() => runGdprListErasures(process.env["DXCRM_DATA_DIR"]));

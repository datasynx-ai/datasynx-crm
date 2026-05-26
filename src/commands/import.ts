import { Command } from "commander";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { success, error, info, bold } from "../ui/colors.js";
import { appendInteraction } from "../fs/interactions-writer.js";

interface ImportResult {
  customersCreated: number;
  interactionsImported: number;
  skipped: number;
  errors: string[];
}

function hashRow(row: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex").slice(0, 16);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function parseCSV(content: string): Array<Record<string, string>> {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = (lines[0] ?? "").split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

function detectFieldMapping(
  headers: string[],
  source: string
): Record<string, string> {
  const lower = headers.map((h) => h.toLowerCase());

  if (source === "hubspot") {
    return {
      name: headers.find((_, i) => ["company name", "company"].includes(lower[i]!)) ?? "",
      email: headers.find((_, i) => lower[i]!.includes("email")) ?? "",
      domain: headers.find((_, i) => lower[i]!.includes("domain") || lower[i]!.includes("website")) ?? "",
      notes: headers.find((_, i) => lower[i]!.includes("note") || lower[i]!.includes("description")) ?? "",
      activityType: headers.find((_, i) => lower[i]!.includes("type") || lower[i]!.includes("activity")) ?? "",
      activityDate: headers.find((_, i) => lower[i]!.includes("date") || lower[i]!.includes("time")) ?? "",
      activityId: headers.find((_, i) => lower[i]!.includes("id") || lower[i]!.includes("record id")) ?? "",
    };
  }

  // generic CSV — best-effort mapping
  return {
    name: headers.find((_, i) => ["name", "company", "organization"].includes(lower[i]!)) ?? headers[0] ?? "",
    email: headers.find((_, i) => lower[i]!.includes("email")) ?? "",
    domain: headers.find((_, i) => lower[i]!.includes("domain") || lower[i]!.includes("website")) ?? "",
    notes: headers.find((_, i) => lower[i]!.includes("note") || lower[i]!.includes("description")) ?? "",
    activityDate: headers.find((_, i) => lower[i]!.includes("date")) ?? "",
  };
}

function ensureCustomer(
  dataDir: string,
  name: string,
  domain: string,
  email: string,
  dryRun: boolean
): { slug: string; created: boolean } {
  const slug = slugify(name || "unknown");
  const customerDir = path.join(dataDir, "customers", slug);
  const mainFactsPath = path.join(customerDir, "main_facts.md");

  if (fs.existsSync(mainFactsPath)) return { slug, created: false };
  if (dryRun) return { slug, created: true };

  fs.mkdirSync(customerDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const frontmatter = [
    "---",
    `name: ${name}`,
    domain ? `domain: ${domain}` : null,
    email ? `email: ${email}` : null,
    "relationship_stage: prospect",
    `created: ${today}`,
    `updated: ${today}`,
    `last_touchpoint: ${today}`,
    "tags: []",
    "---",
  ].filter(Boolean).join("\n");

  fs.writeFileSync(mainFactsPath, `${frontmatter}\n\n# Customer: ${name}\n`, "utf-8");
  fs.writeFileSync(path.join(customerDir, "interactions.md"), `# Interactions — ${name}\n\n`, "utf-8");
  fs.writeFileSync(path.join(customerDir, "pipeline.md"), `# Pipeline — ${name}\n\n`, "utf-8");
  fs.writeFileSync(
    path.join(customerDir, "sources.json"),
    JSON.stringify({ gmail: { query: domain ? `from:${domain} OR to:${domain}` : email ? `from:${email} OR to:${email}` : "", enabled: true }, transcripts: { paths: [], extensions: [".txt", ".vtt"], enabled: false } }, null, 2),
    "utf-8"
  );

  return { slug, created: true };
}

export async function runImport(
  sourcePath: string,
  opts: { from: string; dryRun?: boolean; mode?: string; token?: string; url?: string },
  dataDir?: string
): Promise<ImportResult> {
  const dir = dataDir ?? process.cwd();
  const result: ImportResult = { customersCreated: 0, interactionsImported: 0, skipped: 0, errors: [] };

  // Salesforce API mode — bypass file reading
  if (opts.from === "salesforce" && opts.mode === "api") {
    return runSalesforceApiImport(opts, dir);
  }

  if (!fs.existsSync(sourcePath)) {
    console.error(error(`✗ File not found: ${sourcePath}`));
    process.exit(1);
  }

  const content = fs.readFileSync(sourcePath, "utf-8");
  const rows = parseCSV(content);

  if (rows.length === 0) {
    console.log(info("No rows found in CSV."));
    return result;
  }

  const headers = Object.keys(rows[0]!);
  const mapping = detectFieldMapping(headers, opts.from);

  if (opts.dryRun) {
    console.log(info(`Dry run — ${rows.length} rows, field mapping:`));
    Object.entries(mapping).forEach(([k, v]) => v && console.log(info(`  ${k} ← "${v}"`)));
    console.log(info(`\nWould create up to ${rows.length} customers and interaction entries.`));
    return result;
  }

  // Pass 1: Create customers
  const customerRows = rows.filter((r) => {
    const name = r[mapping.name ?? ""] ?? "";
    return name.trim().length > 0;
  });

  const slugMap = new Map<string, string>();

  for (const row of customerRows) {
    const name = (row[mapping.name ?? ""] ?? "").trim();
    if (!name) continue;

    const domain = (row[mapping.domain ?? ""] ?? "").trim();
    const email = (row[mapping.email ?? ""] ?? "").trim();

    try {
      const { slug, created } = ensureCustomer(dir, name, domain, email, opts.dryRun ?? false);
      slugMap.set(name.toLowerCase(), slug);
      if (created) result.customersCreated++;
    } catch (err) {
      result.errors.push(`Customer '${name}': ${(err as Error).message}`);
    }
  }

  // Pass 2: Import activities/notes
  for (const row of rows) {
    const activityType = (row[mapping.activityType ?? ""] ?? "").trim();
    const notes = (row[mapping.notes ?? ""] ?? "").trim();
    const activityDate = (row[mapping.activityDate ?? ""] ?? "").trim();
    const activityId = (row[mapping.activityId ?? ""] ?? "").trim();
    const name = (row[mapping.name ?? ""] ?? "").trim();

    if (!notes && !activityType) continue;

    const slug = slugMap.get(name.toLowerCase());
    if (!slug) continue;

    const rowHash = hashRow(row);
    const prefix = opts.from === "hubspot" ? "hubspot" : "csv";
    const sourceRef = activityId
      ? `${prefix}://activity/${activityId}`
      : `${prefix}://row/${rowHash}`;

    const date = activityDate
      ? (() => { try { return new Date(activityDate).toISOString().slice(0, 10); } catch { return new Date().toISOString().slice(0, 10); } })()
      : new Date().toISOString().slice(0, 10);

    const type = (() => {
      const t = activityType.toLowerCase();
      if (t.includes("call")) return "Call" as const;
      if (t.includes("meeting") || t.includes("demo")) return "Meeting" as const;
      if (t.includes("email")) return "Email" as const;
      if (t.includes("note")) return "Note" as const;
      return "Note" as const;
    })();

    try {
      const { readInteractions } = await import("../fs/interactions-writer.js");
      const existing = await readInteractions(dir, slug);
      if (existing.includes(sourceRef)) {
        result.skipped++;
        continue;
      }

      await appendInteraction(dir, slug, {
        date,
        type,
        with: name,
        summary: notes.slice(0, 500),
        nextSteps: [],
        sourceRef,
        synced: new Date().toISOString(),
      });

      result.interactionsImported++;
    } catch (err) {
      result.errors.push(`Activity for '${name}': ${(err as Error).message}`);
    }
  }

  return result;
}

async function runSalesforceApiImport(
  opts: { token?: string; url?: string; dryRun?: boolean },
  dir: string
): Promise<ImportResult> {
  const result: ImportResult = { customersCreated: 0, interactionsImported: 0, skipped: 0, errors: [] };
  const token = opts.token ?? process.env["SFDC_TOKEN"] ?? "";
  const instanceUrl = opts.url ?? process.env["SFDC_URL"] ?? "";

  if (!token || !instanceUrl) {
    console.error(error("✗ Salesforce API mode requires --token and --url (or SFDC_TOKEN + SFDC_URL env vars)"));
    process.exit(1);
  }

  const { fetchSalesforceContacts, fetchSalesforceTasks } = await import("../sync/salesforce-client.js");

  let contacts: Awaited<ReturnType<typeof fetchSalesforceContacts>>;
  let tasks: Awaited<ReturnType<typeof fetchSalesforceTasks>>;

  try {
    contacts = await fetchSalesforceContacts(instanceUrl, token);
    tasks = await fetchSalesforceTasks(instanceUrl, token);
  } catch (err) {
    result.errors.push(`Salesforce API: ${(err as Error).message}`);
    return result;
  }

  if (opts.dryRun) {
    console.log(info(`Dry run — ${contacts.length} contacts, ${tasks.length} tasks from Salesforce`));
    return result;
  }

  // Pass 1: contacts → customers
  const slugMap = new Map<string, string>();
  for (const contact of contacts) {
    const name = contact.Name?.trim();
    if (!name) continue;
    const domain = contact.Account?.Website?.replace(/^https?:\/\//, "") ?? "";
    const email = contact.Email ?? "";
    try {
      const { slug, created } = ensureCustomer(dir, name, domain, email, false);
      slugMap.set(contact.Id, slug);
      slugMap.set(name.toLowerCase(), slug);
      if (created) result.customersCreated++;
    } catch (err) {
      result.errors.push(`Contact '${name}': ${(err as Error).message}`);
    }
  }

  // Pass 2: tasks → interactions
  for (const task of tasks) {
    const slug = task.WhoId ? slugMap.get(task.WhoId) : undefined;
    if (!slug) continue;

    const sourceRef = `salesforce://task/${task.Id}`;
    const { readInteractions } = await import("../fs/interactions-writer.js");
    const existing = await readInteractions(dir, slug).catch(() => "");
    if (existing.includes(sourceRef)) { result.skipped++; continue; }

    const date = task.ActivityDate ?? new Date().toISOString().slice(0, 10);
    const notes = (task.Description ?? task.Subject ?? "").slice(0, 500);
    const t = (task.Type ?? "").toLowerCase();
    const type = t.includes("call") ? "Call" as const : t.includes("email") ? "Email" as const : t.includes("meeting") ? "Meeting" as const : "Note" as const;

    try {
      await appendInteraction(dir, slug, {
        date,
        type,
        with: slug,
        summary: notes,
        nextSteps: [],
        sourceRef,
        synced: new Date().toISOString(),
      });
      result.interactionsImported++;
    } catch (err) {
      result.errors.push(`Task ${task.Id}: ${(err as Error).message}`);
    }
  }

  return result;
}

export const importCommand = new Command("import")
  .description("Import customers and interactions from HubSpot, Salesforce, or CSV")
  .argument("<path>", "Path to export file (CSV)")
  .option("--from <source>", "Source CRM: hubspot | csv | salesforce", "csv")
  .option("--dry-run", "Preview what would be imported without writing")
  .option("--mode <mode>", "Import mode: file | api (salesforce only)")
  .option("--token <token>", "API token (Salesforce)")
  .option("--url <url>", "Instance URL (Salesforce, e.g. https://mycompany.my.salesforce.com)")
  .action(async (sourcePath: string, opts: { from: string; dryRun?: boolean; mode?: string; token?: string; url?: string }) => {
    const dryRun = opts.dryRun ?? false;

    if (!dryRun) {
      console.log(info(`Importing from ${bold(opts.from)}: ${sourcePath}`));
    }

    const result = await runImport(sourcePath, opts);

    if (!dryRun) {
      console.log(success(`✓ Import complete:`));
      console.log(info(`  Customers created:      ${result.customersCreated}`));
      console.log(info(`  Interactions imported:  ${result.interactionsImported}`));
      console.log(info(`  Skipped (duplicates):   ${result.skipped}`));
      if (result.errors.length > 0) {
        console.log(error(`  Errors (${result.errors.length}):`));
        result.errors.slice(0, 5).forEach((e) => console.log(error(`    ${e}`)));
      }
    }
  });

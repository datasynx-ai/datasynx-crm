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

const IMPORT_TARGET_FIELDS = ["name", "email", "domain", "notes", "date", "activityType", "sourceId"] as const;

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

function readCsvFromDirectory(dirPath: string, filename: string): string | null {
  const variants = [filename, filename.toLowerCase(), filename.toUpperCase()];
  for (const name of variants) {
    const p = path.join(dirPath, name);
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8") as string;
  }
  const files = fs.readdirSync(dirPath);
  const match = files.find((f) => f.toLowerCase() === filename.toLowerCase());
  if (match) return fs.readFileSync(path.join(dirPath, match), "utf-8") as string;
  return null;
}

async function extractZip(zipPath: string): Promise<string> {
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip(zipPath);
  const tmpDir = `${zipPath}.extracted`;
  fs.mkdirSync(tmpDir, { recursive: true });
  zip.extractAllTo(tmpDir, true);
  return tmpDir;
}

async function runSalesforceFileImport(
  sourcePath: string,
  opts: { dryRun?: boolean },
  dir: string
): Promise<ImportResult> {
  const result: ImportResult = { customersCreated: 0, interactionsImported: 0, skipped: 0, errors: [] };

  let dataDir = sourcePath;
  let tmpDir: string | null = null;

  if (sourcePath.endsWith(".zip")) {
    tmpDir = await extractZip(sourcePath);
    dataDir = tmpDir;
  }

  if (!fs.statSync(dataDir).isDirectory()) {
    result.errors.push("Salesforce file import requires a directory or .zip file");
    return result;
  }

  const accountsCsv = readCsvFromDirectory(dataDir, "Accounts.csv")
    ?? readCsvFromDirectory(dataDir, "accounts.csv");
  const activitiesCsv = readCsvFromDirectory(dataDir, "Activities.csv")
    ?? readCsvFromDirectory(dataDir, "activities.csv")
    ?? readCsvFromDirectory(dataDir, "Tasks.csv")
    ?? readCsvFromDirectory(dataDir, "tasks.csv");

  if (!accountsCsv) {
    result.errors.push("Could not find Accounts.csv in Salesforce export");
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true });
    return result;
  }

  const accounts = parseCSV(accountsCsv);
  const activities = activitiesCsv ? parseCSV(activitiesCsv) : [];

  if (opts.dryRun) {
    console.log(info(`Dry run — ${accounts.length} accounts, ${activities.length} activities from Salesforce export`));
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true });
    return result;
  }

  const slugMap = new Map<string, string>();
  for (const row of accounts) {
    const name = (row["Name"] ?? row["Account Name"] ?? "").trim();
    if (!name) continue;
    const domain = (row["Website"] ?? "").replace(/^https?:\/\//, "");
    const email = row["Email"] ?? "";
    try {
      const { slug, created } = ensureCustomer(dir, name, domain, email, false);
      if (row["Id"]) slugMap.set(row["Id"], slug);
      slugMap.set(name.toLowerCase(), slug);
      if (created) result.customersCreated++;
    } catch (err) {
      result.errors.push(`Account '${name}': ${(err as Error).message}`);
    }
  }

  for (const row of activities) {
    const accountId = row["AccountId"] ?? row["WhatId"] ?? "";
    const slug = accountId ? slugMap.get(accountId) : undefined;
    if (!slug) continue;

    const id = row["Id"] ?? hashRow(row);
    const sourceRef = `salesforce://row/${id}`;
    const { readInteractions } = await import("../fs/interactions-writer.js");
    const existing = await readInteractions(dir, slug).catch(() => "");
    if (existing.includes(sourceRef)) { result.skipped++; continue; }

    const date = row["ActivityDate"] ?? row["CreatedDate"] ?? new Date().toISOString().slice(0, 10);
    const notes = (row["Description"] ?? row["Subject"] ?? "").slice(0, 500);
    const t = (row["Type"] ?? "").toLowerCase();
    const type = t.includes("call") ? "Call" as const : t.includes("email") ? "Email" as const : t.includes("meeting") ? "Meeting" as const : "Note" as const;

    try {
      await appendInteraction(dir, slug, { date, type, with: slug, summary: notes, nextSteps: [], sourceRef, synced: new Date().toISOString() });
      result.interactionsImported++;
    } catch (err) {
      result.errors.push(`Activity ${id}: ${(err as Error).message}`);
    }
  }

  if (tmpDir) fs.rmSync(tmpDir, { recursive: true });
  return result;
}

async function runPipedriveFileImport(
  sourcePath: string,
  opts: { dryRun?: boolean },
  dir: string
): Promise<ImportResult> {
  const result: ImportResult = { customersCreated: 0, interactionsImported: 0, skipped: 0, errors: [] };

  let dataDir = sourcePath;
  let tmpDir: string | null = null;

  if (sourcePath.endsWith(".zip")) {
    tmpDir = await extractZip(sourcePath);
    dataDir = tmpDir;
  }

  if (!fs.statSync(dataDir).isDirectory()) {
    result.errors.push("Pipedrive file import requires a directory or .zip file");
    return result;
  }

  const orgsCsv = readCsvFromDirectory(dataDir, "organizations.csv")
    ?? readCsvFromDirectory(dataDir, "Organizations.csv");
  const activitiesCsv = readCsvFromDirectory(dataDir, "activities.csv")
    ?? readCsvFromDirectory(dataDir, "Activities.csv");

  if (!orgsCsv) {
    result.errors.push("Could not find organizations.csv in Pipedrive export");
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true });
    return result;
  }

  const orgs = parseCSV(orgsCsv);
  const activities = activitiesCsv ? parseCSV(activitiesCsv) : [];

  if (opts.dryRun) {
    console.log(info(`Dry run — ${orgs.length} organizations, ${activities.length} activities from Pipedrive export`));
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true });
    return result;
  }

  const slugMap = new Map<string, string>();
  for (const row of orgs) {
    const name = (row["name"] ?? row["Name"] ?? "").trim();
    if (!name) continue;
    const id = row["id"] ?? row["ID"] ?? "";
    try {
      const { slug, created } = ensureCustomer(dir, name, "", "", false);
      if (id) slugMap.set(id, slug);
      slugMap.set(name.toLowerCase(), slug);
      if (created) result.customersCreated++;
    } catch (err) {
      result.errors.push(`Organization '${name}': ${(err as Error).message}`);
    }
  }

  for (const row of activities) {
    const orgId = row["org_id"] ?? row["organization_id"] ?? "";
    const slug = orgId ? slugMap.get(orgId) : undefined;
    if (!slug) continue;

    const id = row["id"] ?? hashRow(row);
    const sourceRef = `pipedrive://row/${id}`;
    const { readInteractions } = await import("../fs/interactions-writer.js");
    const existing = await readInteractions(dir, slug).catch(() => "");
    if (existing.includes(sourceRef)) { result.skipped++; continue; }

    const date = row["due_date"] ?? row["add_time"]?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const notes = (row["note"] ?? row["subject"] ?? "").slice(0, 500);
    const t = (row["type"] ?? "").toLowerCase();
    const type = t === "call" ? "Call" as const : t === "email" ? "Email" as const : t === "meeting" ? "Meeting" as const : "Note" as const;

    try {
      await appendInteraction(dir, slug, { date, type, with: slug, summary: notes, nextSteps: [], sourceRef, synced: new Date().toISOString() });
      result.interactionsImported++;
    } catch (err) {
      result.errors.push(`Activity ${id}: ${(err as Error).message}`);
    }
  }

  if (tmpDir) fs.rmSync(tmpDir, { recursive: true });
  return result;
}

export async function runImport(
  sourcePath: string,
  opts: { from: string; dryRun?: boolean; mode?: string; token?: string; url?: string },
  dataDir?: string
): Promise<ImportResult> {
  const dir = dataDir ?? process.cwd();
  const result: ImportResult = { customersCreated: 0, interactionsImported: 0, skipped: 0, errors: [] };

  // API import modes — bypass file reading
  if (opts.from === "salesforce" && opts.mode === "api") {
    return runSalesforceApiImport(opts, dir);
  }
  if (opts.from === "pipedrive" && opts.mode === "api") {
    return runPipedriveApiImport(opts, dir);
  }

  // HubSpot multi-file export directory: route to dedicated importer
  // Single-file HubSpot CSV falls through to generic LLM-mapping flow below
  if (opts.from === "hubspot" && sourcePath && fs.existsSync(sourcePath) && fs.statSync(sourcePath).isDirectory()) {
    const { runHubSpotCsvImport } = await import("./import-hubspot.js");
    const r = await runHubSpotCsvImport(sourcePath, dir, opts);
    return {
      customersCreated: r.companiesProcessed,
      interactionsImported: r.engagementsImported + r.dealsImported + r.contactsImported,
      skipped: 0,
      errors: r.errors,
    };
  }
  if (opts.from === "salesforce" && sourcePath) {
    return runSalesforceFileImport(sourcePath, opts, dir);
  }
  if (opts.from === "pipedrive" && sourcePath) {
    return runPipedriveFileImport(sourcePath, opts, dir);
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
  const { mapCsvFields } = await import("../core/llm.js");
  const mapping = await mapCsvFields(headers, [...IMPORT_TARGET_FIELDS]);

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
    const activityType = (row[mapping["activityType"] ?? ""] ?? "").trim();
    const notes = (row[mapping["notes"] ?? ""] ?? "").trim();
    const activityDate = (row[mapping["date"] ?? ""] ?? "").trim();
    const sourceIdVal = (row[mapping["sourceId"] ?? ""] ?? "").trim();
    const name = (row[mapping["name"] ?? ""] ?? "").trim();

    if (!notes && !activityType) continue;

    const slug = slugMap.get(name.toLowerCase());
    if (!slug) continue;

    const rowHash = hashRow(row);
    const prefix = opts.from === "hubspot" ? "hubspot" : "csv";
    const sourceRef = sourceIdVal
      ? `${prefix}://activity/${sourceIdVal}`
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

export async function runPipedriveApiImport(
  opts: { token?: string; url?: string; dryRun?: boolean },
  dir: string = process.cwd()
): Promise<ImportResult> {
  const result: ImportResult = { customersCreated: 0, interactionsImported: 0, skipped: 0, errors: [] };
  const token = opts.token ?? process.env["PIPEDRIVE_TOKEN"] ?? "";
  const instanceUrl = opts.url ?? process.env["PIPEDRIVE_URL"] ?? "";

  if (!token || !instanceUrl) {
    result.errors.push("Pipedrive API mode requires --token and --url (or PIPEDRIVE_TOKEN + PIPEDRIVE_URL env vars)");
    return result;
  }

  const { fetchPipedrivePersons, fetchPipedriveActivities } = await import("../sync/pipedrive-client.js");

  let persons: Awaited<ReturnType<typeof fetchPipedrivePersons>>;
  let activities: Awaited<ReturnType<typeof fetchPipedriveActivities>>;

  try {
    [persons, activities] = await Promise.all([
      fetchPipedrivePersons(instanceUrl, token),
      fetchPipedriveActivities(instanceUrl, token),
    ]);
  } catch (err) {
    result.errors.push(`Pipedrive API: ${(err as Error).message}`);
    return result;
  }

  if (opts.dryRun) {
    console.log(info(`Dry run — ${persons.length} persons, ${activities.length} activities from Pipedrive`));
    return result;
  }

  // Pass 1: persons → customers
  const slugByPersonId = new Map<number, string>();
  const slugByOrgId = new Map<number, string>();

  for (const person of persons) {
    const name = (person.org_name ?? person.name ?? "").trim();
    if (!name) continue;
    const email = person.primary_email ?? "";
    try {
      const { slug, created } = ensureCustomer(dir, name, "", email, false);
      if (person.id) slugByPersonId.set(person.id, slug);
      if (person.org_id?.value) slugByOrgId.set(person.org_id.value, slug);
      if (created) result.customersCreated++;
    } catch (err) {
      result.errors.push(`Person '${name}': ${(err as Error).message}`);
    }
  }

  // Pass 2: activities → interactions
  for (const activity of activities) {
    const slug = (activity.person_id && slugByPersonId.get(activity.person_id))
      ?? (activity.org_id && slugByOrgId.get(activity.org_id))
      ?? undefined;
    if (!slug) continue;

    const sourceRef = `pipedrive://activity/${activity.id}`;
    const { readInteractions } = await import("../fs/interactions-writer.js");
    const existing = await readInteractions(dir, slug).catch(() => "");
    if (existing.includes(sourceRef)) { result.skipped++; continue; }

    const date = activity.due_date ?? new Date().toISOString().slice(0, 10);
    const notes = (activity.note ?? activity.subject ?? "").slice(0, 500);
    const t = (activity.type ?? "").toLowerCase();
    const type = t === "call" ? "Call" as const
      : t === "email" ? "Email" as const
      : t === "meeting" ? "Meeting" as const
      : "Note" as const;

    try {
      await appendInteraction(dir, slug, {
        date,
        type,
        with: slug,
        summary: `${activity.subject ?? type}: ${notes}`,
        nextSteps: [],
        sourceRef,
        synced: new Date().toISOString(),
      });
      result.interactionsImported++;
    } catch (err) {
      result.errors.push(`Activity ${activity.id}: ${(err as Error).message}`);
    }
  }

  return result;
}

export const importCommand = new Command("import")
  .description("Import customers and interactions from HubSpot, Salesforce, Pipedrive, or CSV")
  .argument("[path]", "Path to export file (CSV), optional for API modes")
  .option("--from <source>", "Source CRM: hubspot | csv | salesforce | pipedrive", "csv")
  .option("--dry-run", "Preview what would be imported without writing")
  .option("--mode <mode>", "Import mode: file | api")
  .option("--token <token>", "API token (Salesforce, Pipedrive)")
  .option("--url <url>", "Instance URL (e.g. https://myco.salesforce.com or https://myco.pipedrive.com)")
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

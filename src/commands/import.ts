import { Command } from "commander";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { success, error, info, bold } from "../ui/colors.js";
import { appendInteraction, InteractionDedup } from "../fs/interactions-writer.js";
import { writeFileAtomic } from "../fs/atomic-write.js";
import { writeJsonFile } from "../fs/json-store.js";

interface ImportResult {
  customersCreated: number;
  interactionsImported: number;
  skipped: number;
  errors: string[];
  dealsImported?: number;
  leadsImported?: number;
  eventsImported?: number;
  casesImported?: number;
  quotesImported?: number;
  notesImported?: number;
  campaignsImported?: number;
}

/** Map a Salesforce StageName to opencrm's fixed pipeline stage enum. */
function mapSalesforceStage(
  stageName?: string
): "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost" {
  const s = (stageName ?? "").toLowerCase();
  if (s.includes("won")) return "won";
  if (s.includes("lost")) return "lost";
  if (s.includes("negoti")) return "negotiation";
  if (s.includes("propos") || s.includes("quote")) return "proposal";
  if (s.includes("qualif")) return "qualified";
  return "lead";
}

/** Map a Salesforce Case Status to opencrm's ticket status enum. */
function mapCaseStatus(
  status?: string
): "open" | "in-progress" | "waiting" | "resolved" | "closed" {
  const s = (status ?? "").toLowerCase();
  if (s.includes("closed")) return "closed";
  if (s.includes("resolved")) return "resolved";
  if (s.includes("escalat") || s.includes("wait") || s.includes("hold")) return "waiting";
  if (s.includes("working") || s.includes("progress")) return "in-progress";
  return "open";
}

/** Map a Salesforce Case Priority to opencrm's ticket priority enum. */
function mapCasePriority(priority?: string): "urgent" | "high" | "normal" | "low" {
  const p = (priority ?? "").toLowerCase();
  if (p.includes("urgent") || p.includes("critical")) return "urgent";
  if (p.includes("high")) return "high";
  if (p.includes("low")) return "low";
  return "normal";
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
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });
}

const IMPORT_TARGET_FIELDS = [
  "name",
  "email",
  "domain",
  "notes",
  "date",
  "activityType",
  "sourceId",
] as const;

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
  ]
    .filter(Boolean)
    .join("\n");

  writeFileAtomic(mainFactsPath, `${frontmatter}\n\n# Customer: ${name}\n`);
  writeFileAtomic(path.join(customerDir, "interactions.md"), `# Interactions — ${name}\n\n`);
  writeFileAtomic(path.join(customerDir, "pipeline.md"), `# Pipeline — ${name}\n\n`);
  writeJsonFile(path.join(customerDir, "sources.json"), {
    gmail: {
      query: domain
        ? `from:${domain} OR to:${domain}`
        : email
          ? `from:${email} OR to:${email}`
          : "",
      enabled: true,
    },
    transcripts: { paths: [], extensions: [".txt", ".vtt"], enabled: false },
  });

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
  const result: ImportResult = {
    customersCreated: 0,
    interactionsImported: 0,
    skipped: 0,
    errors: [],
  };

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

  const accountsCsv =
    readCsvFromDirectory(dataDir, "Accounts.csv") ?? readCsvFromDirectory(dataDir, "accounts.csv");
  const activitiesCsv =
    readCsvFromDirectory(dataDir, "Activities.csv") ??
    readCsvFromDirectory(dataDir, "activities.csv") ??
    readCsvFromDirectory(dataDir, "Tasks.csv") ??
    readCsvFromDirectory(dataDir, "tasks.csv");

  if (!accountsCsv) {
    result.errors.push("Could not find Accounts.csv in Salesforce export");
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true });
    return result;
  }

  const accounts = parseCSV(accountsCsv);
  const activities = activitiesCsv ? parseCSV(activitiesCsv) : [];

  if (opts.dryRun) {
    console.log(
      info(
        `Dry run — ${accounts.length} accounts, ${activities.length} activities from Salesforce export`
      )
    );
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

  const dedup = new InteractionDedup(dir);
  for (const row of activities) {
    const accountId = row["AccountId"] ?? row["WhatId"] ?? "";
    const slug = accountId ? slugMap.get(accountId) : undefined;
    if (!slug) continue;

    const id = row["Id"] ?? hashRow(row);
    const sourceRef = `salesforce://row/${id}`;
    if (await dedup.seen(slug, sourceRef)) {
      result.skipped++;
      continue;
    }

    const date = row["ActivityDate"] ?? row["CreatedDate"] ?? new Date().toISOString().slice(0, 10);
    const notes = (row["Description"] ?? row["Subject"] ?? "").slice(0, 500);
    const t = (row["Type"] ?? "").toLowerCase();
    const type = t.includes("call")
      ? ("Call" as const)
      : t.includes("email")
        ? ("Email" as const)
        : t.includes("meeting")
          ? ("Meeting" as const)
          : ("Note" as const);

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
      dedup.markAppended(slug, sourceRef);
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
  const result: ImportResult = {
    customersCreated: 0,
    interactionsImported: 0,
    skipped: 0,
    errors: [],
  };

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

  const orgsCsv =
    readCsvFromDirectory(dataDir, "organizations.csv") ??
    readCsvFromDirectory(dataDir, "Organizations.csv");
  const activitiesCsv =
    readCsvFromDirectory(dataDir, "activities.csv") ??
    readCsvFromDirectory(dataDir, "Activities.csv");

  if (!orgsCsv) {
    result.errors.push("Could not find organizations.csv in Pipedrive export");
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true });
    return result;
  }

  const orgs = parseCSV(orgsCsv);
  const activities = activitiesCsv ? parseCSV(activitiesCsv) : [];

  if (opts.dryRun) {
    console.log(
      info(
        `Dry run — ${orgs.length} organizations, ${activities.length} activities from Pipedrive export`
      )
    );
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

  const dedup = new InteractionDedup(dir);
  for (const row of activities) {
    const orgId = row["org_id"] ?? row["organization_id"] ?? "";
    const slug = orgId ? slugMap.get(orgId) : undefined;
    if (!slug) continue;

    const id = row["id"] ?? hashRow(row);
    const sourceRef = `pipedrive://row/${id}`;
    if (await dedup.seen(slug, sourceRef)) {
      result.skipped++;
      continue;
    }

    const date =
      row["due_date"] ?? row["add_time"]?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const notes = (row["note"] ?? row["subject"] ?? "").slice(0, 500);
    const t = (row["type"] ?? "").toLowerCase();
    const type =
      t === "call"
        ? ("Call" as const)
        : t === "email"
          ? ("Email" as const)
          : t === "meeting"
            ? ("Meeting" as const)
            : ("Note" as const);

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
      dedup.markAppended(slug, sourceRef);
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
  opts: {
    from: string;
    dryRun?: boolean;
    mode?: string;
    token?: string;
    url?: string;
    ownerMap?: Record<string, string>;
    resume?: boolean;
  },
  dataDir?: string
): Promise<ImportResult> {
  const dir = dataDir ?? process.cwd();
  const result: ImportResult = {
    customersCreated: 0,
    interactionsImported: 0,
    skipped: 0,
    errors: [],
  };

  // API import modes — bypass file reading
  if (opts.from === "salesforce" && opts.mode === "api") {
    return runSalesforceApiImport(opts, dir);
  }
  if (opts.from === "pipedrive" && opts.mode === "api") {
    return runPipedriveApiImport(opts, dir);
  }

  // HubSpot multi-file export directory: route to dedicated importer
  // Single-file HubSpot CSV falls through to generic LLM-mapping flow below
  if (
    opts.from === "hubspot" &&
    sourcePath &&
    fs.existsSync(sourcePath) &&
    fs.statSync(sourcePath).isDirectory()
  ) {
    const { runHubSpotCsvImport } = await import("./import-hubspot.js");
    const r = await runHubSpotCsvImport(sourcePath, dir, {
      ...(opts.dryRun ? { dryRun: true } : {}),
      ...(opts.resume ? { resume: true } : {}),
      ownerMap: opts.ownerMap ?? {},
    });
    if (r.customPropertiesSaved > 0) {
      console.error(`[import] Custom properties saved: ${r.customPropertiesSaved}`);
    }
    if (r.ownersResolved > 0) {
      console.error(`[import] Owners resolved: ${r.ownersResolved}`);
    }
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
  const dedup = new InteractionDedup(dir);
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
      ? (() => {
          try {
            return new Date(activityDate).toISOString().slice(0, 10);
          } catch {
            return new Date().toISOString().slice(0, 10);
          }
        })()
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
      if (await dedup.seen(slug, sourceRef)) {
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
      dedup.markAppended(slug, sourceRef);

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
  const result: ImportResult = {
    customersCreated: 0,
    interactionsImported: 0,
    skipped: 0,
    errors: [],
  };
  const token = opts.token ?? process.env["SFDC_TOKEN"] ?? "";
  const instanceUrl = opts.url ?? process.env["SFDC_URL"] ?? "";

  if (!token || !instanceUrl) {
    console.error(
      error("✗ Salesforce API mode requires --token and --url (or SFDC_TOKEN + SFDC_URL env vars)")
    );
    process.exit(1);
  }

  const {
    fetchSalesforceContacts,
    fetchSalesforceTasks,
    fetchSalesforceOpportunities,
    fetchSalesforceLeads,
    fetchSalesforceEvents,
    fetchSalesforceCases,
    fetchSalesforceLineItems,
    fetchSalesforceNotes,
    fetchSalesforceCampaignMembers,
  } = await import("../sync/salesforce-client.js");

  let contacts: Awaited<ReturnType<typeof fetchSalesforceContacts>>;
  let tasks: Awaited<ReturnType<typeof fetchSalesforceTasks>>;
  let opportunities: Awaited<ReturnType<typeof fetchSalesforceOpportunities>>;
  let leads: Awaited<ReturnType<typeof fetchSalesforceLeads>>;
  let events: Awaited<ReturnType<typeof fetchSalesforceEvents>>;
  let cases: Awaited<ReturnType<typeof fetchSalesforceCases>>;
  let lineItems: Awaited<ReturnType<typeof fetchSalesforceLineItems>>;
  let notes: Awaited<ReturnType<typeof fetchSalesforceNotes>>;
  let campaignMembers: Awaited<ReturnType<typeof fetchSalesforceCampaignMembers>>;

  try {
    contacts = await fetchSalesforceContacts(instanceUrl, token);
    tasks = await fetchSalesforceTasks(instanceUrl, token);
    opportunities = (await fetchSalesforceOpportunities(instanceUrl, token)) ?? [];
    leads = (await fetchSalesforceLeads(instanceUrl, token)) ?? [];
    events = (await fetchSalesforceEvents(instanceUrl, token)) ?? [];
    cases = (await fetchSalesforceCases(instanceUrl, token)) ?? [];
    lineItems = (await fetchSalesforceLineItems(instanceUrl, token)) ?? [];
    notes = (await fetchSalesforceNotes(instanceUrl, token)) ?? [];
    campaignMembers = (await fetchSalesforceCampaignMembers(instanceUrl, token)) ?? [];
  } catch (err) {
    result.errors.push(`Salesforce API: ${(err as Error).message}`);
    return result;
  }

  if (opts.dryRun) {
    console.log(
      info(
        `Dry run — ${contacts.length} contacts, ${tasks.length} tasks, ${opportunities.length} opportunities, ${leads.length} leads, ${events.length} events, ${cases.length} cases from Salesforce`
      )
    );
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
  const dedup = new InteractionDedup(dir);
  for (const task of tasks) {
    const slug = task.WhoId ? slugMap.get(task.WhoId) : undefined;
    if (!slug) continue;

    const sourceRef = `salesforce://task/${task.Id}`;
    if (await dedup.seen(slug, sourceRef)) {
      result.skipped++;
      continue;
    }

    const date = task.ActivityDate ?? new Date().toISOString().slice(0, 10);
    const notes = (task.Description ?? task.Subject ?? "").slice(0, 500);
    const t = (task.Type ?? "").toLowerCase();
    const type = t.includes("call")
      ? ("Call" as const)
      : t.includes("email")
        ? ("Email" as const)
        : t.includes("meeting")
          ? ("Meeting" as const)
          : ("Note" as const);

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
      dedup.markAppended(slug, sourceRef);
      result.interactionsImported++;
    } catch (err) {
      result.errors.push(`Task ${task.Id}: ${(err as Error).message}`);
    }
  }

  // Pass 3: opportunities → pipeline deals
  const { upsertDeal } = await import("../fs/pipeline-writer.js");
  const today = new Date().toISOString().slice(0, 10);
  const oppSlugById = new Map<string, { slug: string; dealName: string }>();
  for (const opp of opportunities) {
    const accountName = opp.Account?.Name?.trim();
    if (!opp.Name || !accountName) continue;

    let slug = slugMap.get(accountName.toLowerCase());
    if (!slug) {
      const domain = opp.Account?.Website?.replace(/^https?:\/\//, "") ?? "";
      try {
        const r = ensureCustomer(dir, accountName, domain, "", false);
        slug = r.slug;
        slugMap.set(accountName.toLowerCase(), slug);
        if (r.created) result.customersCreated++;
      } catch (err) {
        result.errors.push(`Opportunity '${opp.Name}': ${(err as Error).message}`);
        continue;
      }
    }
    oppSlugById.set(opp.Id, { slug, dealName: opp.Name });

    try {
      await upsertDeal(dir, slug, {
        name: opp.Name,
        stage: mapSalesforceStage(opp.StageName),
        currency: "EUR",
        updated: today,
        notes: `Imported from Salesforce (${opp.StageName ?? "unknown stage"})`,
        ...(typeof opp.Amount === "number" ? { value: opp.Amount } : {}),
        ...(typeof opp.Probability === "number" ? { probability: opp.Probability } : {}),
        ...(opp.CloseDate ? { close_date: opp.CloseDate } : {}),
      });
      result.dealsImported = (result.dealsImported ?? 0) + 1;
    } catch (err) {
      result.errors.push(`Opportunity '${opp.Name}': ${(err as Error).message}`);
    }
  }

  // Pass 4: leads → customers (+ a lead interaction capturing status/title)
  for (const lead of leads) {
    const name = lead.Company?.trim() || lead.Name?.trim();
    if (!name) continue;

    const domain = lead.Website?.replace(/^https?:\/\//, "") ?? lead.Email?.split("@")[1] ?? "";
    let slug: string;
    try {
      const r = ensureCustomer(dir, name, domain, lead.Email ?? "", false);
      slug = r.slug;
      slugMap.set(name.toLowerCase(), slug);
      if (r.created) result.customersCreated++;
    } catch (err) {
      result.errors.push(`Lead '${name}': ${(err as Error).message}`);
      continue;
    }

    const sourceRef = `salesforce://lead/${lead.Id}`;
    if (await dedup.seen(slug, sourceRef)) {
      result.skipped++;
      continue;
    }

    const contactPart = lead.Title ? `${lead.Name}, ${lead.Title}` : lead.Name;
    try {
      await appendInteraction(dir, slug, {
        date: new Date().toISOString().slice(0, 10),
        type: "Note",
        with: lead.Name,
        summary: `Salesforce Lead imported (status: ${lead.Status ?? "n/a"}; contact: ${contactPart})`,
        nextSteps: [],
        sourceRef,
        synced: new Date().toISOString(),
      });
      dedup.markAppended(slug, sourceRef);
      result.leadsImported = (result.leadsImported ?? 0) + 1;
    } catch (err) {
      result.errors.push(`Lead ${lead.Id}: ${(err as Error).message}`);
    }
  }

  // Pass 5: events (calendar) → Meeting interactions, linked by WhoId/WhatId
  for (const event of events) {
    const slug = event.WhoId
      ? slugMap.get(event.WhoId)
      : event.WhatId
        ? slugMap.get(event.WhatId)
        : undefined;
    if (!slug) {
      result.skipped++;
      continue;
    }

    const sourceRef = `salesforce://event/${event.Id}`;
    if (await dedup.seen(slug, sourceRef)) {
      result.skipped++;
      continue;
    }

    const date = (event.StartDateTime ?? event.ActivityDate ?? new Date().toISOString()).slice(
      0,
      10
    );
    try {
      await appendInteraction(dir, slug, {
        date,
        type: "Meeting",
        with: slug,
        subject: event.Subject ?? "Salesforce Event",
        summary: (event.Description ?? event.Subject ?? "").slice(0, 500),
        nextSteps: [],
        sourceRef,
        synced: new Date().toISOString(),
      });
      dedup.markAppended(slug, sourceRef);
      result.eventsImported = (result.eventsImported ?? 0) + 1;
    } catch (err) {
      result.errors.push(`Event ${event.Id}: ${(err as Error).message}`);
    }
  }

  // Pass 6: cases → tickets (status/priority mapped, SLA computed, deduped by case ref)
  const { readTickets, upsertTicket, nextTicketId } = await import("../fs/ticket-writer.js");
  const { calcSlaDue, loadSlaRules } = await import("../core/sla-engine.js");
  const slaRules = loadSlaRules(dir);
  for (const c of cases) {
    const accountName = c.Account?.Name?.trim();
    if (!accountName) {
      result.skipped++;
      continue;
    }
    let slug = slugMap.get(accountName.toLowerCase());
    if (!slug) {
      try {
        const r = ensureCustomer(dir, accountName, "", "", false);
        slug = r.slug;
        slugMap.set(accountName.toLowerCase(), slug);
        if (r.created) result.customersCreated++;
      } catch (err) {
        result.errors.push(`Case '${c.Id}': ${(err as Error).message}`);
        continue;
      }
    }
    // Make the account/contact reachable for note linking (Pass 8)
    if (c.AccountId) slugMap.set(c.AccountId, slug);
    if (c.ContactId) slugMap.set(c.ContactId, slug);

    const caseRef = `salesforce://case/${c.Id}`;
    const existingTickets = await readTickets(dir, slug);
    if (existingTickets.some((t) => (t.description ?? "").includes(caseRef))) {
      result.skipped++;
      continue;
    }

    const created = (c.CreatedDate ?? new Date().toISOString()).slice(0, 10);
    const status = mapCaseStatus(c.Status);
    const priority = mapCasePriority(c.Priority);
    const isDone = status === "closed" || status === "resolved";
    try {
      await upsertTicket(dir, slug, {
        id: nextTicketId(existingTickets),
        title: c.Subject ?? `Case ${c.CaseNumber ?? c.Id}`,
        status,
        priority,
        created,
        slaDue: calcSlaDue(created, priority, slaRules),
        description: `${c.Description ?? ""}\n\n[${caseRef}]`.trim(),
        ...(isDone ? { resolved: (c.ClosedDate ?? created).slice(0, 10) } : {}),
      });
      result.casesImported = (result.casesImported ?? 0) + 1;
    } catch (err) {
      result.errors.push(`Case ${c.Id}: ${(err as Error).message}`);
    }
  }

  // Pass 7: opportunity line items → one quote per opportunity
  if (lineItems.length > 0 && oppSlugById.size > 0) {
    const { generateQuote, listQuotes } = await import("../core/quote-generator.js");
    const byOpp = new Map<string, typeof lineItems>();
    for (const li of lineItems) {
      if (!li.OpportunityId) continue;
      const arr = byOpp.get(li.OpportunityId) ?? [];
      arr.push(li);
      byOpp.set(li.OpportunityId, arr);
    }
    for (const [oppId, items] of byOpp) {
      const opp = oppSlugById.get(oppId);
      if (!opp) continue;
      // Dedup: skip if a quote for this deal already exists for the customer.
      if (listQuotes(dir, opp.slug).some((q) => q.dealName === opp.dealName)) {
        result.skipped++;
        continue;
      }
      const quoteLineItems = items.map((li) => {
        const quantity = typeof li.Quantity === "number" && li.Quantity > 0 ? li.Quantity : 1;
        const unitPrice =
          typeof li.UnitPrice === "number"
            ? li.UnitPrice
            : typeof li.TotalPrice === "number"
              ? li.TotalPrice / quantity
              : 0;
        return {
          description: li.Product2?.Name ?? li.Description ?? "Line item",
          quantity,
          unitPrice,
        };
      });
      try {
        await generateQuote(dir, {
          slug: opp.slug,
          dealName: opp.dealName,
          lineItems: quoteLineItems,
        });
        result.quotesImported = (result.quotesImported ?? 0) + 1;
      } catch (err) {
        result.errors.push(`LineItems for '${opp.dealName}': ${(err as Error).message}`);
      }
    }
  }

  // Pass 8: notes → Note interactions, linked by ParentId (account/contact/opp)
  for (const note of notes) {
    const slug = note.ParentId ? slugMap.get(note.ParentId) : undefined;
    if (!slug) {
      result.skipped++;
      continue;
    }
    const sourceRef = `salesforce://note/${note.Id}`;
    if (await dedup.seen(slug, sourceRef)) {
      result.skipped++;
      continue;
    }
    const date = (note.CreatedDate ?? new Date().toISOString()).slice(0, 10);
    const title = note.Title ?? "Salesforce Note";
    try {
      await appendInteraction(dir, slug, {
        date,
        type: "Note",
        with: slug,
        subject: title,
        summary: `${title}${note.Body ? `: ${note.Body}` : ""}`.slice(0, 500),
        nextSteps: [],
        sourceRef,
        synced: new Date().toISOString(),
      });
      dedup.markAppended(slug, sourceRef);
      result.notesImported = (result.notesImported ?? 0) + 1;
    } catch (err) {
      result.errors.push(`Note ${note.Id}: ${(err as Error).message}`);
    }
  }

  // Pass 9: campaign members → Note interactions, linked by ContactId/LeadId
  for (const cm of campaignMembers) {
    const slug = cm.ContactId
      ? slugMap.get(cm.ContactId)
      : cm.LeadId
        ? slugMap.get(cm.LeadId)
        : undefined;
    if (!slug) {
      result.skipped++;
      continue;
    }
    const sourceRef = `salesforce://campaignmember/${cm.Id}`;
    if (await dedup.seen(slug, sourceRef)) {
      result.skipped++;
      continue;
    }
    const campaignName = cm.Campaign?.Name ?? cm.CampaignId ?? "Unknown campaign";
    try {
      await appendInteraction(dir, slug, {
        date: (cm.CreatedDate ?? new Date().toISOString()).slice(0, 10),
        type: "Note",
        with: slug,
        subject: `Campaign: ${campaignName}`,
        summary: `Salesforce Campaign: ${campaignName} (status: ${cm.Status ?? "n/a"})`,
        nextSteps: [],
        sourceRef,
        synced: new Date().toISOString(),
      });
      dedup.markAppended(slug, sourceRef);
      result.campaignsImported = (result.campaignsImported ?? 0) + 1;
    } catch (err) {
      result.errors.push(`CampaignMember ${cm.Id}: ${(err as Error).message}`);
    }
  }

  return result;
}

export async function runPipedriveApiImport(
  opts: { token?: string; url?: string; dryRun?: boolean },
  dir: string = process.cwd()
): Promise<ImportResult> {
  const result: ImportResult = {
    customersCreated: 0,
    interactionsImported: 0,
    skipped: 0,
    errors: [],
  };
  const token = opts.token ?? process.env["PIPEDRIVE_TOKEN"] ?? "";
  const instanceUrl = opts.url ?? process.env["PIPEDRIVE_URL"] ?? "";

  if (!token || !instanceUrl) {
    result.errors.push(
      "Pipedrive API mode requires --token and --url (or PIPEDRIVE_TOKEN + PIPEDRIVE_URL env vars)"
    );
    return result;
  }

  const { fetchPipedrivePersons, fetchPipedriveActivities } =
    await import("../sync/pipedrive-client.js");

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
    console.log(
      info(`Dry run — ${persons.length} persons, ${activities.length} activities from Pipedrive`)
    );
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
  const dedup = new InteractionDedup(dir);
  for (const activity of activities) {
    const slug =
      (activity.person_id && slugByPersonId.get(activity.person_id)) ??
      (activity.org_id && slugByOrgId.get(activity.org_id)) ??
      undefined;
    if (!slug) continue;

    const sourceRef = `pipedrive://activity/${activity.id}`;
    if (await dedup.seen(slug, sourceRef)) {
      result.skipped++;
      continue;
    }

    const date = activity.due_date ?? new Date().toISOString().slice(0, 10);
    const notes = (activity.note ?? activity.subject ?? "").slice(0, 500);
    const t = (activity.type ?? "").toLowerCase();
    const type =
      t === "call"
        ? ("Call" as const)
        : t === "email"
          ? ("Email" as const)
          : t === "meeting"
            ? ("Meeting" as const)
            : ("Note" as const);

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
      dedup.markAppended(slug, sourceRef);
      result.interactionsImported++;
    } catch (err) {
      result.errors.push(`Activity ${activity.id}: ${(err as Error).message}`);
    }
  }

  return result;
}

export const importCommand = new Command("import")
  .description("Import customers and interactions from HubSpot, Salesforce, Pipedrive, or CSV")
  .argument("[path]", "Path to export file or directory")
  .option("--from <source>", "Source CRM: hubspot | csv | salesforce | pipedrive", "csv")
  .option("--dry-run", "Preview what would be imported without writing")
  .option("--mode <mode>", "Import mode: file | api")
  .option("--token <token>", "API token (Salesforce, Pipedrive, HubSpot)")
  .option("--url <url>", "Instance URL (e.g. https://myco.salesforce.com)")
  .option("--analyze", "Analyze export and show what would be imported (no write)")
  .option("--resume", "Resume a previously interrupted import")
  .option(
    "--owner-map <mapping>",
    'Map HubSpot owner emails to reps: "alice@hs.com=alice,bob@hs.com=bob"'
  )
  .action(
    async (
      sourcePath: string,
      opts: {
        from: string;
        dryRun?: boolean;
        mode?: string;
        token?: string;
        url?: string;
        analyze?: boolean;
        resume?: boolean;
        ownerMap?: string;
      }
    ) => {
      const dryRun = opts.dryRun ?? false;

      // Parse owner map
      const ownerMap: Record<string, string> = {};
      if (opts.ownerMap) {
        for (const pair of opts.ownerMap.split(",")) {
          const [hs, rep] = pair.split("=");
          if (hs && rep) ownerMap[hs.trim()] = rep.trim();
        }
      }

      // HubSpot analyze mode
      if (opts.analyze && opts.from === "hubspot" && sourcePath) {
        const { analyzeHubSpotExport } = await import("./import-hubspot.js");
        const analysis = await analyzeHubSpotExport(sourcePath);
        console.log(bold("\nDatasynxOpenCRM — HubSpot Import Analysis"));
        console.log("==========================================");
        console.log(info(`Companies:      ${analysis.companiesFound}`));
        console.log(
          info(
            `Contacts:       ${analysis.contactsFound} (${analysis.unmappedContacts} unmapped companies)`
          )
        );
        console.log(info(`Deals:          ${analysis.dealsFound}`));
        console.log(info(`Engagements:    ${analysis.engagementsFound}`));
        if (analysis.customPropertiesDetected.length > 0) {
          console.log(
            info(`\nCustom Properties: ${analysis.customPropertiesDetected.length} detected`)
          );
          console.log(
            `  ${analysis.customPropertiesDetected.slice(0, 10).join(", ")}${analysis.customPropertiesDetected.length > 10 ? " ..." : ""}`
          );
        }
        if (analysis.ownersDetected.length > 0) {
          console.log(info(`\nOwners detected: ${analysis.ownersDetected.join(", ")}`));
          console.log(
            `  Use --owner-map "${analysis.ownersDetected.map((o) => `${o}=<rep>`).join(",")}"`
          );
        }
        if (analysis.unknownStages.length > 0) {
          console.log(
            info(`\nUnknown stages (→ "qualified"): ${analysis.unknownStages.join(", ")}`)
          );
        }
        console.log(info(`\nEstimated import time: ~${analysis.estimatedMinutes} min`));
        console.log(info(`\nRun without --analyze to start import.`));
        return;
      }

      if (!dryRun) {
        console.log(info(`Importing from ${bold(opts.from)}: ${sourcePath}`));
      }

      const result = await runImport(
        sourcePath,
        {
          from: opts.from,
          ...(dryRun ? { dryRun: true } : {}),
          ...(opts.mode ? { mode: opts.mode } : {}),
          ...(opts.token ? { token: opts.token } : {}),
          ...(opts.url ? { url: opts.url } : {}),
          ...(opts.resume ? { resume: true } : {}),
          ownerMap,
        },
        process.env["DXCRM_DATA_DIR"]
      );

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
    }
  );

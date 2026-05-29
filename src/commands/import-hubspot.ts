import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import type { PipelineDeal } from "../schemas/pipeline.js";
import type { InteractionEntry } from "../schemas/interaction.js";

export interface HubSpotImportResult {
  companiesProcessed: number;
  contactsImported: number;
  dealsImported: number;
  engagementsImported: number;
  errors: string[];
}

const STAGE_MAP: Record<string, PipelineDeal["stage"]> = {
  appointmentscheduled: "qualified",
  qualifiedtobuy: "qualified",
  presentationscheduled: "proposal",
  decisionmakerboughtin: "negotiation",
  contractsent: "negotiation",
  closedwon: "won",
  closedlost: "lost",
};

const TYPE_MAP: Record<string, InteractionEntry["type"]> = {
  NOTE: "Note",
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  TASK: "Note",
};

function parseCSV(content: string): Array<Record<string, string>> {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = (lines[0] ?? "").split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function hashStr(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
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
  const lines = [
    "---",
    `name: ${name}`,
    domain ? `domain: ${domain}` : null,
    email ? `email: ${email}` : null,
    "relationship_stage: prospect",
    `created: ${today}`,
    `updated: ${today}`,
    `last_touchpoint: ${today}`,
    "tags: []",
    "currency: EUR",
    "---",
  ].filter(Boolean).join("\n");
  fs.writeFileSync(mainFactsPath, `${lines}\n\n# Customer: ${name}\n`, "utf-8");
  fs.writeFileSync(path.join(customerDir, "interactions.md"), `# Interactions — ${name}\n\n`, "utf-8");
  fs.writeFileSync(path.join(customerDir, "pipeline.md"), `# Pipeline — ${name}\n\n`, "utf-8");
  fs.writeFileSync(
    path.join(customerDir, "sources.json"),
    JSON.stringify({
      gmail: { query: domain ? `from:${domain} OR to:${domain}` : email ? `from:${email} OR to:${email}` : "", enabled: true },
      transcripts: { paths: [], extensions: [".txt", ".vtt"], enabled: false },
    }, null, 2),
    "utf-8"
  );
  return { slug, created: true };
}

function readMainFactsRaw(dataDir: string, slug: string): string {
  const p = path.join(dataDir, "customers", slug, "main_facts.md");
  return fs.existsSync(p) ? (fs.readFileSync(p, "utf-8") as string) : "";
}

function updateMainFactsField(dataDir: string, slug: string, field: string, value: string): void {
  const p = path.join(dataDir, "customers", slug, "main_facts.md");
  if (!fs.existsSync(p)) return;
  let content = fs.readFileSync(p, "utf-8") as string;
  const regex = new RegExp(`^${field}:.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${field}: ${value}`);
  } else {
    // Insert before the closing --- of the frontmatter (second occurrence)
    const firstDash = content.indexOf("---");
    const secondDash = content.indexOf("---", firstDash + 3);
    if (secondDash >= 0) {
      content = content.slice(0, secondDash) + `${field}: ${value}\n` + content.slice(secondDash);
    }
  }
  fs.writeFileSync(p, content, "utf-8");
}

export async function runHubSpotCsvImport(
  exportDir: string,
  dataDir: string,
  opts: { dryRun?: boolean }
): Promise<HubSpotImportResult> {
  const result: HubSpotImportResult = {
    companiesProcessed: 0,
    contactsImported: 0,
    dealsImported: 0,
    engagementsImported: 0,
    errors: [],
  };

  const dryRun = opts.dryRun ?? false;

  // Find CSV files — support both direct files and directory
  const companiesPath = fs.existsSync(path.join(exportDir, "companies.csv"))
    ? path.join(exportDir, "companies.csv")
    : fs.existsSync(exportDir) && exportDir.endsWith("companies.csv") ? exportDir : null;
  const contactsPath = fs.existsSync(path.join(exportDir, "contacts.csv"))
    ? path.join(exportDir, "contacts.csv")
    : null;
  const dealsPath = fs.existsSync(path.join(exportDir, "deals.csv"))
    ? path.join(exportDir, "deals.csv")
    : null;
  const engagementsPath = fs.existsSync(path.join(exportDir, "engagements.csv"))
    ? path.join(exportDir, "engagements.csv")
    : null;

  const companySlugMap = new Map<string, string>(); // companyName.lower → slug
  const emailSlugMap = new Map<string, string>(); // email.lower → slug

  // Phase 1 — Companies
  if (companiesPath && fs.existsSync(companiesPath)) {
    const rows = parseCSV(fs.readFileSync(companiesPath, "utf-8") as string);
    for (const row of rows) {
      const name = (row["name"] ?? row["Name"] ?? "").trim();
      if (!name) continue;
      const domain = (row["domain"] ?? row["Domain"] ?? row["website"] ?? "").trim();
      const email = "";
      try {
        const { slug, created } = ensureCustomer(dataDir, name, domain, email, dryRun);
        companySlugMap.set(name.toLowerCase(), slug);
        if (created) result.companiesProcessed++;
        else result.companiesProcessed++; // count processed even if already exists
      } catch (err) {
        result.errors.push(`Company '${name}': ${(err as Error).message}`);
      }
    }
  }

  // Phase 2 — Contacts
  if (contactsPath && fs.existsSync(contactsPath)) {
    const rows = parseCSV(fs.readFileSync(contactsPath, "utf-8") as string);
    for (const row of rows) {
      const firstName = (row["firstname"] ?? row["First Name"] ?? "").trim();
      const lastName = (row["lastname"] ?? row["Last Name"] ?? "").trim();
      const email = (row["email"] ?? row["Email"] ?? "").trim();
      const companyName = (row["company"] ?? row["Company"] ?? row["associated_company"] ?? "").trim();
      const phone = (row["phone"] ?? row["Phone"] ?? "").trim();

      // Try to resolve to an existing company slug
      let slug = companySlugMap.get(companyName.toLowerCase());

      if (!slug && companyName) {
        // Company wasn't in companies.csv — create it
        const domain = (row["website"] ?? "").trim();
        try {
          const { slug: newSlug, created } = ensureCustomer(dataDir, companyName, domain, email, dryRun);
          slug = newSlug;
          companySlugMap.set(companyName.toLowerCase(), newSlug);
          if (created) result.companiesProcessed++;
        } catch (err) {
          result.errors.push(`Auto-company '${companyName}': ${(err as Error).message}`);
        }
      }

      if (!slug) continue;

      // Add email and phone to main_facts if present and not dryRun
      if (!dryRun) {
        if (email) {
          const existing = readMainFactsRaw(dataDir, slug);
          if (!existing.includes(`email:`)) {
            updateMainFactsField(dataDir, slug, "email", email);
          }
        }
        if (phone) {
          const existing = readMainFactsRaw(dataDir, slug);
          if (!existing.includes(`phone:`)) {
            updateMainFactsField(dataDir, slug, "phone", phone);
          }
        }
        // Store primary contact name
        if (firstName || lastName) {
          const contactName = [firstName, lastName].filter(Boolean).join(" ");
          const existing = readMainFactsRaw(dataDir, slug);
          if (!existing.includes(`primary_contact:`)) {
            updateMainFactsField(dataDir, slug, "primary_contact", contactName);
          }
        }
      }

      if (email) emailSlugMap.set(email.toLowerCase(), slug);
      result.contactsImported++;
    }
  }

  // Phase 3 — Deals
  if (dealsPath && fs.existsSync(dealsPath) && !dryRun) {
    const { upsertDeal } = await import("../fs/pipeline-writer.js");
    const rows = parseCSV(fs.readFileSync(dealsPath, "utf-8") as string);
    for (const row of rows) {
      const dealName = (row["dealname"] ?? row["Deal Name"] ?? row["name"] ?? "").trim();
      const companyName = (row["associated_company"] ?? row["Associated Company"] ?? row["company"] ?? "").trim();
      const amountStr = (row["amount"] ?? row["Amount"] ?? "0").trim().replace(/[^0-9.]/g, "");
      const stageRaw = (row["dealstage"] ?? row["Deal Stage"] ?? "").trim().toLowerCase();
      const closeDate = (row["closedate"] ?? row["Close Date"] ?? "").trim().slice(0, 10);

      if (!dealName) continue;

      const slug = companySlugMap.get(companyName.toLowerCase()) ?? slugify(companyName || "unknown");
      const stage = STAGE_MAP[stageRaw] ?? "qualified";
      const amount = parseFloat(amountStr) || 0;

      const deal: PipelineDeal = {
        name: dealName,
        stage,
        value: amount,
        currency: "EUR",
        probability: stage === "won" ? 1 : stage === "lost" ? 0 : 0.5,
        close_date: closeDate || new Date().toISOString().slice(0, 10),
        updated: new Date().toISOString().slice(0, 10),
        notes: `hubspot://deal/${hashStr(dealName + companyName)}`,
      };

      try {
        await upsertDeal(dataDir, slug, deal);
        result.dealsImported++;
      } catch (err) {
        result.errors.push(`Deal '${dealName}': ${(err as Error).message}`);
      }
    }
  } else if (dealsPath && dryRun) {
    const rows = parseCSV(fs.readFileSync(dealsPath, "utf-8") as string);
    result.dealsImported = rows.filter((r) => (r["dealname"] ?? r["name"] ?? "").trim()).length;
  }

  // Phase 4 — Engagements
  if (engagementsPath && fs.existsSync(engagementsPath) && !dryRun) {
    const { appendInteraction, readInteractions } = await import("../fs/interactions-writer.js");
    const rows = parseCSV(fs.readFileSync(engagementsPath, "utf-8") as string);
    for (const row of rows) {
      const engType = (row["engagement_type"] ?? row["Engagement Type"] ?? row["type"] ?? "NOTE").trim().toUpperCase();
      const timestamp = (row["hs_timestamp"] ?? row["Timestamp"] ?? row["date"] ?? "").trim();
      const body = (row["hs_body_preview"] ?? row["Body"] ?? row["notes"] ?? "").trim();
      const contactEmail = (row["associated_contact_email"] ?? row["Contact Email"] ?? "").trim().toLowerCase();
      const engId = (row["id"] ?? row["engagement_id"] ?? hashStr(timestamp + body)).trim();

      const slug = emailSlugMap.get(contactEmail) ?? companySlugMap.get(contactEmail);
      if (!slug) continue;

      const sourceRef = `hubspot://engagement/${engId}`;
      const existing = await readInteractions(dataDir, slug).catch(() => "");
      if (existing.includes(sourceRef)) continue;

      const date = timestamp.slice(0, 10) || new Date().toISOString().slice(0, 10);
      const type = TYPE_MAP[engType] ?? "Note";

      try {
        await appendInteraction(dataDir, slug, {
          date,
          type,
          with: contactEmail || slug,
          summary: body || `${type} imported from HubSpot`,
          nextSteps: [],
          sourceRef,
          synced: new Date().toISOString(),
        });
        result.engagementsImported++;
      } catch (err) {
        result.errors.push(`Engagement ${engId}: ${(err as Error).message}`);
      }
    }
  } else if (engagementsPath && dryRun) {
    const rows = parseCSV(fs.readFileSync(engagementsPath, "utf-8") as string);
    result.engagementsImported = rows.length;
  }

  return result;
}

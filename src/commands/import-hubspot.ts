import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { streamCSV } from "../core/csv-stream.js";
import { escapeRegExp } from "../core/regex.js";
import { writeFileAtomic } from "../fs/atomic-write.js";
import { writeJsonFile } from "../fs/json-store.js";
import { upsertContact } from "../fs/contacts-writer.js";
import type { PipelineDeal } from "../schemas/pipeline.js";
import type { InteractionEntry } from "../schemas/interaction.js";

export interface HubSpotImportResult {
  companiesProcessed: number;
  contactsImported: number;
  dealsImported: number;
  engagementsImported: number;
  errors: string[];
  customPropertiesSaved: number;
  ownersResolved: number;
}

export interface HubSpotImportOptions {
  dryRun?: boolean;
  ownerMap?: Record<string, string>; // hubspot email → dxcrm actor
  resume?: boolean;
  analyzeOnly?: boolean;
}

export interface HubSpotAnalysis {
  companiesFound: number;
  contactsFound: number;
  dealsFound: number;
  engagementsFound: number;
  customPropertiesDetected: string[];
  ownersDetected: string[];
  unknownStages: string[];
  unmappedContacts: number;
  estimatedMinutes: number;
}

// ─── Stage + Type maps ────────────────────────────────────────────────────────

const STAGE_MAP: Record<string, PipelineDeal["stage"]> = {
  appointmentscheduled: "qualified",
  qualifiedtobuy: "qualified",
  presentationscheduled: "proposal",
  decisionmakerboughtin: "negotiation",
  contractsent: "negotiation",
  closedwon: "won",
  closedlost: "lost",
  // Additional HubSpot stages
  prospecting: "lead",
  qualification: "qualified",
  proposal: "proposal",
  negotiation: "negotiation",
  closedwon2: "won",
  closedlost2: "lost",
};

const TYPE_MAP: Record<string, InteractionEntry["type"]> = {
  NOTE: "Note",
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  TASK: "Note",
  LINKEDIN_MESSAGE: "Email",
  WHATSAPP_MESSAGE: "Email",
  POSTAL_MAIL: "Note",
};

// Known HubSpot columns → dxcrm main_facts fields
const COMPANY_FIELD_MAP: Record<string, string> = {
  hs_annual_revenue: "annual_revenue",
  num_associated_contacts: "contact_count",
  industry: "industry",
  city: "city",
  country: "country",
  hs_lead_status: "lead_status",
  lifecyclestage: "lifecycle_stage",
  numberofemployees: "employee_count",
  phone: "phone",
  address: "address",
  zip: "zip",
  state: "state",
};

const KNOWN_COMPANY_COLUMNS = new Set([
  "name",
  "Name",
  "domain",
  "Domain",
  "website",
  "Website",
  "phone",
  "Phone",
  "address",
  "Address",
  "city",
  "City",
  "country",
  "Country",
  "state",
  "State",
  "zip",
  "Zip",
  "industry",
  "Industry",
  "numberofemployees",
  "Number of Employees",
  "hs_annual_revenue",
  "Annual Revenue",
  "lifecyclestage",
  "Lifecycle Stage",
  "hubspot_owner_email",
  "HubSpot Owner Email",
  "create_date",
  "createdate",
  "hs_lastmodifieddate",
  "hs_object_id",
  "Record ID",
]);

// ─── Utilities ────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function hashStr(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

function coerceDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  // HubSpot timestamps: "2026-01-15 14:30:00 UTC", "1705318200000" (ms), "2026-01-15"
  if (/^\d{13}$/.test(raw.trim())) {
    return new Date(parseInt(raw, 10)).toISOString().slice(0, 10);
  }
  const d = new Date(raw.trim());
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

// ─── Customer creation ────────────────────────────────────────────────────────

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
  ]
    .filter(Boolean)
    .join("\n");
  writeFileAtomic(mainFactsPath, `${lines}\n\n# Customer: ${name}\n`);
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

function readMainFactsRaw(dataDir: string, slug: string): string {
  const p = path.join(dataDir, "customers", slug, "main_facts.md");
  return fs.existsSync(p) ? (fs.readFileSync(p, "utf-8") as string) : "";
}

/** Patch several frontmatter fields in main_facts.md with a single read+write. */
function updateMainFactsFields(
  dataDir: string,
  slug: string,
  fields: Record<string, string | undefined>
): void {
  const entries = Object.entries(fields).filter(
    (e): e is [string, string] => e[1] !== undefined && e[1] !== ""
  );
  if (entries.length === 0) return;
  const p = path.join(dataDir, "customers", slug, "main_facts.md");
  if (!fs.existsSync(p)) return;
  let content = fs.readFileSync(p, "utf-8") as string;
  for (const [field, value] of entries) {
    const regex = new RegExp(`^${escapeRegExp(field)}:.*$`, "m");
    if (regex.test(content)) {
      content = content.replace(regex, `${field}: ${value}`);
    } else {
      const firstDash = content.indexOf("---");
      const secondDash = content.indexOf("---", firstDash + 3);
      if (secondDash >= 0) {
        content = content.slice(0, secondDash) + `${field}: ${value}\n` + content.slice(secondDash);
      }
    }
  }
  writeFileAtomic(p, content);
}

// ─── Custom Properties ────────────────────────────────────────────────────────

function saveCustomProperties(dataDir: string, slug: string, props: Record<string, string>): void {
  if (Object.keys(props).length === 0) return;
  const p = path.join(dataDir, "customers", slug, "custom_properties.json");
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(p)) {
    try {
      existing = JSON.parse(fs.readFileSync(p, "utf-8") as string) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }
  const merged = {
    source: "hubspot-import",
    importedAt: new Date().toISOString(),
    properties: { ...((existing["properties"] as Record<string, string>) ?? {}), ...props },
  };
  writeJsonFile(p, merged);
}

// ─── Progress / Resume ────────────────────────────────────────────────────────

interface ImportProgress {
  importId: string;
  source: string;
  startedAt: string;
  phases: {
    companies: { status: "done" | "in-progress" | "pending"; processed: number };
    contacts: { status: "done" | "in-progress" | "pending"; processed: number };
    deals: { status: "done" | "in-progress" | "pending"; processed: number };
    engagements: { status: "done" | "in-progress" | "pending"; processed: number };
  };
}

function progressPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "import-progress.json");
}

function readProgress(dataDir: string): ImportProgress | null {
  const p = progressPath(dataDir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8") as string) as ImportProgress;
  } catch {
    return null;
  }
}

function writeProgress(dataDir: string, progress: ImportProgress): void {
  fs.mkdirSync(path.dirname(progressPath(dataDir)), { recursive: true });
  writeJsonFile(progressPath(dataDir), progress);
}

function clearProgress(dataDir: string): void {
  const p = progressPath(dataDir);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ─── Analyze ──────────────────────────────────────────────────────────────────

export async function analyzeHubSpotExport(exportDir: string): Promise<HubSpotAnalysis> {
  const analysis: HubSpotAnalysis = {
    companiesFound: 0,
    contactsFound: 0,
    dealsFound: 0,
    engagementsFound: 0,
    customPropertiesDetected: [],
    ownersDetected: [],
    unknownStages: [],
    unmappedContacts: 0,
    estimatedMinutes: 0,
  };

  const customProps = new Set<string>();
  const owners = new Set<string>();
  const unknownStages = new Set<string>();
  const companyNames = new Set<string>();

  // Companies
  const companiesPath = path.join(exportDir, "companies.csv");
  if (fs.existsSync(companiesPath)) {
    for await (const row of streamCSV(companiesPath)) {
      analysis.companiesFound++;
      const name = (row["name"] ?? row["Name"] ?? "").trim();
      if (name) companyNames.add(name.toLowerCase());
      const owner = row["hubspot_owner_email"] ?? row["HubSpot Owner Email"] ?? "";
      if (owner) owners.add(owner);
      // Detect custom columns
      for (const key of Object.keys(row)) {
        if (!KNOWN_COMPANY_COLUMNS.has(key) && row[key]) customProps.add(key);
      }
    }
  }

  // Contacts
  const contactsPath = path.join(exportDir, "contacts.csv");
  if (fs.existsSync(contactsPath)) {
    for await (const row of streamCSV(contactsPath)) {
      analysis.contactsFound++;
      const company = (row["company"] ?? row["Company"] ?? row["associated_company"] ?? "").trim();
      if (company && !companyNames.has(company.toLowerCase())) analysis.unmappedContacts++;
      const owner = row["contact_owner"] ?? row["Contact Owner"] ?? "";
      if (owner) owners.add(owner);
    }
  }

  // Deals
  const dealsPath = path.join(exportDir, "deals.csv");
  if (fs.existsSync(dealsPath)) {
    for await (const row of streamCSV(dealsPath)) {
      analysis.dealsFound++;
      const stage = (row["dealstage"] ?? row["Deal Stage"] ?? "").trim().toLowerCase();
      if (stage && !STAGE_MAP[stage]) unknownStages.add(stage);
    }
  }

  // Engagements
  const engagementsPath = path.join(exportDir, "engagements.csv");
  if (fs.existsSync(engagementsPath)) {
    for await (const _row of streamCSV(engagementsPath)) {
      analysis.engagementsFound++;
    }
  }

  analysis.customPropertiesDetected = Array.from(customProps).slice(0, 50);
  analysis.ownersDetected = Array.from(owners);
  analysis.unknownStages = Array.from(unknownStages);

  const totalRows =
    analysis.companiesFound +
    analysis.contactsFound +
    analysis.dealsFound +
    analysis.engagementsFound;
  analysis.estimatedMinutes = Math.ceil(totalRows / 2000); // ~2000 rows/min

  return analysis;
}

// ─── Main Import ──────────────────────────────────────────────────────────────

export async function runHubSpotCsvImport(
  exportDir: string,
  dataDir: string,
  opts: HubSpotImportOptions = {}
): Promise<HubSpotImportResult> {
  const result: HubSpotImportResult = {
    companiesProcessed: 0,
    contactsImported: 0,
    dealsImported: 0,
    engagementsImported: 0,
    errors: [],
    customPropertiesSaved: 0,
    ownersResolved: 0,
  };

  const dryRun = opts.dryRun ?? false;
  const ownerMap = opts.ownerMap ?? {};

  // Resume handling
  let progress: ImportProgress | null = null;
  if (opts.resume) {
    progress = readProgress(dataDir);
    if (progress) {
      console.error(`[import] Resuming import ${progress.importId}...`);
    }
  }

  if (!progress) {
    progress = {
      importId: `hs-import-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`,
      source: exportDir,
      startedAt: new Date().toISOString(),
      phases: {
        companies: { status: "pending", processed: 0 },
        contacts: { status: "pending", processed: 0 },
        deals: { status: "pending", processed: 0 },
        engagements: { status: "pending", processed: 0 },
      },
    };
  }

  const companySlugMap = new Map<string, string>(); // name.lower → slug
  const emailSlugMap = new Map<string, string>(); // email.lower → slug

  // ── Phase 1: Companies ──────────────────────────────────────────────────────
  const companiesPath = path.join(exportDir, "companies.csv");
  if (fs.existsSync(companiesPath) && progress.phases.companies.status !== "done") {
    progress.phases.companies.status = "in-progress";
    if (!dryRun) writeProgress(dataDir, progress);

    for await (const row of streamCSV(companiesPath)) {
      const name = (row["name"] ?? row["Name"] ?? "").trim();
      if (!name) continue;

      const domain = (
        row["domain"] ??
        row["Domain"] ??
        row["website"] ??
        row["Website"] ??
        ""
      ).trim();
      const hubspotId = (row["hs_object_id"] ?? row["Record ID"] ?? "").trim();

      try {
        const { slug, created } = ensureCustomer(dataDir, name, domain, "", dryRun);
        companySlugMap.set(name.toLowerCase(), slug);
        result.companiesProcessed++;

        if (!dryRun && created) {
          // Map known fields + owner + HubSpot id, batched into one read+write.
          const factsPatch: Record<string, string | undefined> = {};
          for (const [hsKey, dxKey] of Object.entries(COMPANY_FIELD_MAP)) {
            const val = row[hsKey] ?? "";
            if (val) factsPatch[dxKey] = val;
          }

          const ownerEmail = row["hubspot_owner_email"] ?? row["HubSpot Owner Email"] ?? "";
          if (ownerEmail && ownerMap[ownerEmail]) {
            factsPatch["assigned_rep"] = ownerMap[ownerEmail]!;
            result.ownersResolved++;
          }

          if (hubspotId) factsPatch["hubspot_company_id"] = hubspotId;

          updateMainFactsFields(dataDir, slug, factsPatch);

          // Custom properties — everything not in known columns
          const customProps: Record<string, string> = {};
          for (const [key, val] of Object.entries(row)) {
            if (!KNOWN_COMPANY_COLUMNS.has(key) && val) customProps[key] = val;
          }
          if (Object.keys(customProps).length > 0) {
            saveCustomProperties(dataDir, slug, customProps);
            result.customPropertiesSaved += Object.keys(customProps).length;
          }
        }
      } catch (err) {
        result.errors.push(`Company '${name}': ${(err as Error).message}`);
      }

      progress.phases.companies.processed++;
    }

    progress.phases.companies.status = "done";
    if (!dryRun) writeProgress(dataDir, progress);
  } else if (progress.phases.companies.status === "done") {
    // Rebuild maps from disk for resume
    const customersDir = path.join(dataDir, "customers");
    if (fs.existsSync(customersDir)) {
      for (const slug of fs.readdirSync(customersDir)) {
        const mf = path.join(customersDir, slug, "main_facts.md");
        if (!fs.existsSync(mf)) continue;
        const content = fs.readFileSync(mf, "utf-8") as string;
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        if (nameMatch?.[1]) companySlugMap.set(nameMatch[1].trim().toLowerCase(), slug);
      }
    }
  }

  // ── Phase 2: Contacts ───────────────────────────────────────────────────────
  const contactsPath = path.join(exportDir, "contacts.csv");
  if (fs.existsSync(contactsPath) && progress.phases.contacts.status !== "done") {
    progress.phases.contacts.status = "in-progress";
    if (!dryRun) writeProgress(dataDir, progress);

    for await (const row of streamCSV(contactsPath)) {
      const firstName = (row["firstname"] ?? row["First Name"] ?? "").trim();
      const lastName = (row["lastname"] ?? row["Last Name"] ?? "").trim();
      const email = (row["email"] ?? row["Email"] ?? "").trim();
      const companyName = (
        row["company"] ??
        row["Company"] ??
        row["associated_company"] ??
        row["Associated Company"] ??
        ""
      ).trim();
      const phone = (row["phone"] ?? row["Phone"] ?? row["mobilephone"] ?? "").trim();
      const title = (row["jobtitle"] ?? row["Job Title"] ?? "").trim();
      const department = (row["department"] ?? row["Department"] ?? "").trim();
      const hubspotId = (row["vid"] ?? row["Contact ID"] ?? row["hs_object_id"] ?? "").trim();

      let slug = companySlugMap.get(companyName.toLowerCase());

      if (!slug && companyName) {
        const domain = (row["website"] ?? "").trim();
        try {
          const { slug: newSlug, created } = ensureCustomer(
            dataDir,
            companyName,
            domain,
            email,
            dryRun
          );
          slug = newSlug;
          companySlugMap.set(companyName.toLowerCase(), newSlug);
          if (created) result.companiesProcessed++;
        } catch (err) {
          result.errors.push(`Auto-company '${companyName}': ${(err as Error).message}`);
        }
      }

      if (!slug) continue;

      if (!dryRun) {
        const contactName = [firstName, lastName].filter(Boolean).join(" ");
        const isFirst = !fs.existsSync(path.join(dataDir, "customers", slug, "contacts.json"));

        // Multi-contact support
        if (email || contactName) {
          const contactEntry = {
            email: email || `${slugify(contactName)}@unknown.local`,
            name: contactName || email,
            ...(title ? { title } : {}),
            ...(phone ? { phone } : {}),
            ...(department ? { department } : {}),
            ...(hubspotId ? { hubspotId } : {}),
            isPrimary: isFirst,
            createdAt: new Date().toISOString(),
          };
          try {
            upsertContact(dataDir, slug, contactEntry);
          } catch {
            /* skip invalid */
          }
        }

        // Update main_facts primary contact (first contact only) — batched into
        // a single read+write instead of one per field.
        const existing = readMainFactsRaw(dataDir, slug);
        const factsPatch: Record<string, string | undefined> = {};
        if (email && !existing.includes("email:")) factsPatch["email"] = email;
        if (phone && !existing.includes("phone:")) factsPatch["phone"] = phone;
        if (contactName && !existing.includes("primary_contact:"))
          factsPatch["primary_contact"] = contactName;

        // Owner mapping
        const ownerEmail = row["contact_owner"] ?? row["Contact Owner"] ?? "";
        if (ownerEmail && ownerMap[ownerEmail] && !existing.includes("assigned_rep:")) {
          factsPatch["assigned_rep"] = ownerMap[ownerEmail]!;
          result.ownersResolved++;
        }
        updateMainFactsFields(dataDir, slug, factsPatch);
      }

      if (email) emailSlugMap.set(email.toLowerCase(), slug);
      result.contactsImported++;
      progress.phases.contacts.processed++;
    }

    progress.phases.contacts.status = "done";
    if (!dryRun) writeProgress(dataDir, progress);
  }

  // ── Phase 3: Deals ──────────────────────────────────────────────────────────
  const dealsPath = path.join(exportDir, "deals.csv");
  if (fs.existsSync(dealsPath) && progress.phases.deals.status !== "done") {
    if (!dryRun) {
      const { upsertDeal } = await import("../fs/pipeline-writer.js");
      progress.phases.deals.status = "in-progress";
      writeProgress(dataDir, progress);

      for await (const row of streamCSV(dealsPath)) {
        const dealName = (row["dealname"] ?? row["Deal Name"] ?? row["name"] ?? "").trim();
        if (!dealName) continue;

        const companyName = (
          row["associated_company"] ??
          row["Associated Company"] ??
          row["company"] ??
          ""
        ).trim();
        const amountStr = (row["amount"] ?? row["Amount"] ?? "0").trim().replace(/[^0-9.]/g, "");
        const stageRaw = (row["dealstage"] ?? row["Deal Stage"] ?? "").trim().toLowerCase();
        const closeDateRaw = (
          row["closedate"] ??
          row["Close Date"] ??
          row["close_date"] ??
          ""
        ).trim();
        const currency = (row["deal_currency_code"] ?? row["Currency"] ?? "EUR").trim();
        const dealId = (row["hs_deal_id"] ?? row["hs_object_id"] ?? row["Record ID"] ?? "").trim();
        const ownerEmail = (row["hubspot_owner_email"] ?? row["HubSpot Owner Email"] ?? "").trim();
        const description = (row["description"] ?? row["Description"] ?? "").trim();

        const slug =
          companySlugMap.get(companyName.toLowerCase()) ?? slugify(companyName || "unknown");
        const stage = STAGE_MAP[stageRaw] ?? "qualified";
        const amount = parseFloat(amountStr) || 0;
        const closeDate = coerceDate(closeDateRaw);

        const notesParts: string[] = [];
        if (dealId) notesParts.push(`hubspot://deal/${dealId}`);
        if (description) notesParts.push(description.slice(0, 200));
        if (ownerEmail && ownerMap[ownerEmail]) notesParts.push(`owner:${ownerMap[ownerEmail]}`);

        const deal: PipelineDeal = {
          name: dealName,
          stage,
          value: amount,
          currency: currency || "EUR",
          probability: stage === "won" ? 1 : stage === "lost" ? 0 : 0.5,
          close_date: closeDate,
          updated: new Date().toISOString().slice(0, 10),
          ...(notesParts.length > 0 ? { notes: notesParts.join(" | ") } : {}),
        };

        try {
          await upsertDeal(dataDir, slug, deal);
          result.dealsImported++;
        } catch (err) {
          result.errors.push(`Deal '${dealName}': ${(err as Error).message}`);
        }

        progress.phases.deals.processed++;
      }

      progress.phases.deals.status = "done";
      writeProgress(dataDir, progress);
    } else {
      // Dry run count
      for await (const row of streamCSV(dealsPath)) {
        if ((row["dealname"] ?? row["name"] ?? "").trim()) result.dealsImported++;
      }
      progress.phases.deals.status = "done";
    }
  }

  // ── Phase 4: Engagements ────────────────────────────────────────────────────
  const engagementsPath = path.join(exportDir, "engagements.csv");
  if (fs.existsSync(engagementsPath) && progress.phases.engagements.status !== "done") {
    if (!dryRun) {
      const { appendInteraction, InteractionDedup } = await import("../fs/interactions-writer.js");
      const dedup = new InteractionDedup(dataDir);
      progress.phases.engagements.status = "in-progress";
      writeProgress(dataDir, progress);

      for await (const row of streamCSV(engagementsPath)) {
        const engType = (
          row["engagement_type"] ??
          row["Engagement Type"] ??
          row["type"] ??
          row["Type"] ??
          "NOTE"
        )
          .trim()
          .toUpperCase();
        const timestamp = (
          row["hs_timestamp"] ??
          row["Timestamp"] ??
          row["date"] ??
          row["createdate"] ??
          ""
        ).trim();
        const body = (
          row["hs_body_preview"] ??
          row["Body"] ??
          row["notes"] ??
          row["Notes"] ??
          row["hs_note_body"] ??
          ""
        ).trim();
        const subject = (row["subject"] ?? row["Subject"] ?? "").trim();
        const contactEmail = (
          row["associated_contact_email"] ??
          row["Contact Email"] ??
          row["from_email"] ??
          ""
        )
          .trim()
          .toLowerCase();
        const engId = (
          row["id"] ??
          row["engagement_id"] ??
          row["hs_object_id"] ??
          hashStr(timestamp + body)
        ).trim();
        const callDuration = (row["call_duration"] ?? row["hs_call_duration"] ?? "").trim();
        const callOutcome = (row["call_outcome"] ?? row["hs_call_disposition"] ?? "").trim();
        const callRecording = (
          row["call_recording_url"] ??
          row["hs_call_recording_url"] ??
          ""
        ).trim();

        const slug =
          emailSlugMap.get(contactEmail) ??
          companySlugMap.get((row["associated_company"] ?? "").toLowerCase().trim());
        if (!slug) continue;

        const sourceRef = `hubspot://engagement/${engId}`;
        try {
          if (await dedup.seen(slug, sourceRef)) continue;

          const date = coerceDate(timestamp);
          const type = TYPE_MAP[engType] ?? "Note";

          // Build rich summary
          const summaryParts: string[] = [];
          if (subject) summaryParts.push(`Subject: ${subject}`);
          if (body) summaryParts.push(body.slice(0, 500));
          if (callDuration) summaryParts.push(`Duration: ${callDuration}s`);
          if (callOutcome) summaryParts.push(`Outcome: ${callOutcome}`);
          if (callRecording) summaryParts.push(`Recording: ${callRecording}`);

          const summary = summaryParts.join(" | ") || `${type} imported from HubSpot`;

          await appendInteraction(dataDir, slug, {
            date,
            type,
            with: contactEmail || slug,
            summary,
            nextSteps: [],
            sourceRef,
            synced: new Date().toISOString(),
          });
          dedup.markAppended(slug, sourceRef);
          result.engagementsImported++;
        } catch (err) {
          result.errors.push(`Engagement ${engId}: ${(err as Error).message}`);
        }

        progress.phases.engagements.processed++;
      }

      progress.phases.engagements.status = "done";
      writeProgress(dataDir, progress);
    } else {
      for await (const _row of streamCSV(engagementsPath)) result.engagementsImported++;
      progress.phases.engagements.status = "done";
    }
  }

  // Done — clear progress file
  if (!dryRun) clearProgress(dataDir);

  return result;
}

import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => { const { fs } = await import("memfs"); return { default: fs, ...fs }; });
vi.mock("@lancedb/lancedb", () => ({ connect: vi.fn().mockResolvedValue({ tableNames: vi.fn().mockResolvedValue([]) }) }));

const DATA_DIR = "/data";

const COMPANIES_CSV = `name,domain
Acme Corp,acme.com
Beta Inc,beta.io
`;

const CONTACTS_CSV = `firstname,lastname,email,company,phone
Alice,Smith,alice@acme.com,Acme Corp,+49111
Bob,Jones,bob@beta.io,Beta Inc,
`;

const DEALS_CSV = `dealname,amount,dealstage,closedate,associated_company
Main Deal,50000,contractsent,2026-09-30,Acme Corp
Closed Won,20000,closedwon,2026-06-30,Beta Inc
`;

const ENGAGEMENTS_CSV = `engagement_type,hs_timestamp,hs_body_preview,associated_contact_email,id
CALL,2026-05-01T10:00:00Z,Initial discovery call,alice@acme.com,eng001
EMAIL,2026-05-10T09:00:00Z,Sent proposal PDF,alice@acme.com,eng002
`;

function seedExportDir(overrides: Record<string, string> = {}) {
  vol.fromJSON({
    [`${DATA_DIR}/exports/companies.csv`]: COMPANIES_CSV,
    [`${DATA_DIR}/exports/contacts.csv`]: CONTACTS_CSV,
    [`${DATA_DIR}/exports/deals.csv`]: DEALS_CSV,
    [`${DATA_DIR}/exports/engagements.csv`]: ENGAGEMENTS_CSV,
    ...overrides,
  });
}

describe("runHubSpotCsvImport", () => {
  beforeEach(() => { vol.reset(); vi.resetModules(); });

  it("creates companies from companies.csv", async () => {
    seedExportDir();
    const { runHubSpotCsvImport } = await import("../../src/commands/import-hubspot.js");
    const result = await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, {});
    expect(result.companiesProcessed).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it("creates customer directories on disk", async () => {
    seedExportDir();
    const { runHubSpotCsvImport } = await import("../../src/commands/import-hubspot.js");
    await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, {});
    const acmeFacts = vol.toJSON()[`${DATA_DIR}/customers/acme-corp/main_facts.md`];
    expect(acmeFacts).toBeDefined();
    expect(acmeFacts).toContain("Acme Corp");
  });

  it("imports contacts and links to company", async () => {
    seedExportDir();
    const { runHubSpotCsvImport } = await import("../../src/commands/import-hubspot.js");
    const result = await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, {});
    expect(result.contactsImported).toBe(2);
  });

  it("writes email to main_facts from contact", async () => {
    seedExportDir();
    const { runHubSpotCsvImport } = await import("../../src/commands/import-hubspot.js");
    await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, {});
    const facts = vol.toJSON()[`${DATA_DIR}/customers/acme-corp/main_facts.md`] as string;
    expect(facts).toContain("alice@acme.com");
  });

  it("imports deals with stage mapping", async () => {
    seedExportDir();
    const { runHubSpotCsvImport } = await import("../../src/commands/import-hubspot.js");
    const result = await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, {});
    expect(result.dealsImported).toBe(2);
  });

  it("maps closedwon stage correctly", async () => {
    seedExportDir();
    const { runHubSpotCsvImport } = await import("../../src/commands/import-hubspot.js");
    await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, {});
    const pipeline = vol.toJSON()[`${DATA_DIR}/customers/beta-inc/pipeline.md`] as string;
    expect(pipeline).toContain("won");
  });

  it("imports engagements as interactions", async () => {
    seedExportDir();
    const { runHubSpotCsvImport } = await import("../../src/commands/import-hubspot.js");
    const result = await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, {});
    expect(result.engagementsImported).toBe(2);
  });

  it("is idempotent — double import does not duplicate engagements", async () => {
    seedExportDir();
    const { runHubSpotCsvImport } = await import("../../src/commands/import-hubspot.js");
    await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, {});
    const result2 = await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, {});
    expect(result2.engagementsImported).toBe(0); // already imported
  });

  it("dry-run returns counts without writing files", async () => {
    seedExportDir();
    const { runHubSpotCsvImport } = await import("../../src/commands/import-hubspot.js");
    const result = await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, { dryRun: true });
    expect(result.companiesProcessed).toBeGreaterThan(0);
    // No customer dirs created
    const files = Object.keys(vol.toJSON());
    expect(files.some((f) => f.includes("/customers/"))).toBe(false);
  });

  it("works with only companies.csv present", async () => {
    vol.fromJSON({ [`${DATA_DIR}/exports/companies.csv`]: COMPANIES_CSV });
    const { runHubSpotCsvImport } = await import("../../src/commands/import-hubspot.js");
    const result = await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, {});
    expect(result.companiesProcessed).toBe(2);
    expect(result.errors).toEqual([]);
  });
});

// ─── Enterprise features ──────────────────────────────────────────────────────

describe("analyzeHubSpotExport", () => {
  beforeEach(() => { vol.reset(); vi.resetModules(); });

  it("returns accurate counts from all 4 CSVs", async () => {
    seedExportDir();
    const { analyzeHubSpotExport } = await import("../../src/commands/import-hubspot.js");
    const analysis = await analyzeHubSpotExport(`${DATA_DIR}/exports`);
    expect(analysis.companiesFound).toBe(2);
    expect(analysis.contactsFound).toBe(2);
    expect(analysis.dealsFound).toBe(2);
    expect(analysis.engagementsFound).toBe(2);
  });

  it("detects unknown deal stages", async () => {
    seedExportDir({
      [`${DATA_DIR}/exports/deals.csv`]:
        `dealname,dealstage,associated_company\nTest Deal,totally_unknown_stage,Acme Corp\n`,
    });
    const { analyzeHubSpotExport } = await import("../../src/commands/import-hubspot.js");
    const analysis = await analyzeHubSpotExport(`${DATA_DIR}/exports`);
    expect(analysis.unknownStages).toContain("totally_unknown_stage");
  });

  it("detects custom properties from non-standard company columns", async () => {
    seedExportDir({
      [`${DATA_DIR}/exports/companies.csv`]:
        `name,domain,crm_segment,customer_tier\nAcme Corp,acme.com,enterprise,gold\n`,
    });
    const { analyzeHubSpotExport } = await import("../../src/commands/import-hubspot.js");
    const analysis = await analyzeHubSpotExport(`${DATA_DIR}/exports`);
    expect(analysis.customPropertiesDetected).toContain("crm_segment");
    expect(analysis.customPropertiesDetected).toContain("customer_tier");
  });

  it("computes estimatedMinutes from total row count", async () => {
    seedExportDir();
    const { analyzeHubSpotExport } = await import("../../src/commands/import-hubspot.js");
    const analysis = await analyzeHubSpotExport(`${DATA_DIR}/exports`);
    expect(analysis.estimatedMinutes).toBeGreaterThanOrEqual(1);
  });

  it("works with only companies.csv present", async () => {
    vol.fromJSON({ [`${DATA_DIR}/exports/companies.csv`]: COMPANIES_CSV });
    const { analyzeHubSpotExport } = await import("../../src/commands/import-hubspot.js");
    const analysis = await analyzeHubSpotExport(`${DATA_DIR}/exports`);
    expect(analysis.companiesFound).toBe(2);
    expect(analysis.contactsFound).toBe(0);
    expect(analysis.dealsFound).toBe(0);
  });

  it("counts unmapped contacts (contact company not in companies.csv)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/exports/companies.csv`]: COMPANIES_CSV,
      [`${DATA_DIR}/exports/contacts.csv`]:
        `firstname,lastname,email,company\nOrphan,User,orphan@unknown.io,Unknown Corp\n`,
    });
    const { analyzeHubSpotExport } = await import("../../src/commands/import-hubspot.js");
    const analysis = await analyzeHubSpotExport(`${DATA_DIR}/exports`);
    expect(analysis.unmappedContacts).toBe(1);
  });
});

describe("multi-contact import — contacts.json", () => {
  beforeEach(() => { vol.reset(); vi.resetModules(); });

  it("writes all contacts linked to a company into contacts.json", async () => {
    seedExportDir({
      [`${DATA_DIR}/exports/contacts.csv`]:
        `firstname,lastname,email,company\nAlice,Smith,alice@acme.com,Acme Corp\nCarol,Doe,carol@acme.com,Acme Corp\n`,
    });
    const { runHubSpotCsvImport } = await import("../../src/commands/import-hubspot.js");
    await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, {});
    const raw = vol.toJSON()[`${DATA_DIR}/customers/acme-corp/contacts.json`] as string;
    expect(raw).toBeDefined();
    const contacts = JSON.parse(raw) as Array<{ email: string }>;
    expect(contacts).toHaveLength(2);
    const emails = contacts.map((c) => c.email);
    expect(emails).toContain("alice@acme.com");
    expect(emails).toContain("carol@acme.com");
  });

  it("marks first contact as primary", async () => {
    seedExportDir();
    const { runHubSpotCsvImport } = await import("../../src/commands/import-hubspot.js");
    await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, {});
    const raw = vol.toJSON()[`${DATA_DIR}/customers/acme-corp/contacts.json`] as string;
    const contacts = JSON.parse(raw) as Array<{ email: string; isPrimary: boolean }>;
    expect(contacts.filter((c) => c.isPrimary)).toHaveLength(1);
  });
});

describe("custom properties import", () => {
  beforeEach(() => { vol.reset(); vi.resetModules(); });

  it("saves non-standard columns to custom_properties.json", async () => {
    seedExportDir({
      [`${DATA_DIR}/exports/companies.csv`]:
        `name,domain,crm_segment,customer_tier\nAcme Corp,acme.com,enterprise,gold\n`,
    });
    const { runHubSpotCsvImport } = await import("../../src/commands/import-hubspot.js");
    const result = await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, {});
    expect(result.customPropertiesSaved).toBeGreaterThan(0);
    const raw = vol.toJSON()[`${DATA_DIR}/customers/acme-corp/custom_properties.json`] as string;
    expect(raw).toBeDefined();
    const file = JSON.parse(raw) as { source: string; properties: Record<string, string> };
    expect(file.source).toBe("hubspot-import");
    expect(file.properties["crm_segment"]).toBe("enterprise");
    expect(file.properties["customer_tier"]).toBe("gold");
  });
});

describe("owner map import", () => {
  beforeEach(() => { vol.reset(); vi.resetModules(); });

  it("resolves owner email to rep name via ownerMap", async () => {
    seedExportDir({
      [`${DATA_DIR}/exports/companies.csv`]:
        `name,domain,hubspot_owner_email\nAcme Corp,acme.com,alice@hs.com\n`,
    });
    const { runHubSpotCsvImport } = await import("../../src/commands/import-hubspot.js");
    const result = await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, {
      ownerMap: { "alice@hs.com": "alice-rep" },
    });
    expect(result.ownersResolved).toBe(1);
    const facts = vol.toJSON()[`${DATA_DIR}/customers/acme-corp/main_facts.md`] as string;
    expect(facts).toContain("alice-rep");
  });

  it("does not increment ownersResolved when owner not in map", async () => {
    seedExportDir({
      [`${DATA_DIR}/exports/companies.csv`]:
        `name,domain,hubspot_owner_email\nAcme Corp,acme.com,unknown@hs.com\n`,
    });
    const { runHubSpotCsvImport } = await import("../../src/commands/import-hubspot.js");
    const result = await runHubSpotCsvImport(`${DATA_DIR}/exports`, DATA_DIR, {
      ownerMap: { "alice@hs.com": "alice-rep" },
    });
    expect(result.ownersResolved).toBe(0);
  });
});

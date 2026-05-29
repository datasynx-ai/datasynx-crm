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

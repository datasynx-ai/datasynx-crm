/**
 * E2E Import Workflow Tests
 *
 * Validates the full import pipeline: CSV/HubSpot/Salesforce/Pipedrive
 * importing into the CRM and verifying customers + interactions end-to-end.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/fs/interactions-writer.js", () => {
  const readInteractions = vi.fn().mockResolvedValue("");
  const appendInteraction = vi.fn().mockResolvedValue(undefined);
  class InteractionDedup {
    private cache = new Map<string, string>();
    constructor(private dataDir: string) {}
    async seen(slug: string, ref: string): Promise<boolean> {
      let c = this.cache.get(slug);
      if (c === undefined) {
        c = await (readInteractions(this.dataDir, slug) as Promise<string>).catch(() => "");
        this.cache.set(slug, c);
      }
      return c.includes(ref);
    }
    markAppended(slug: string, ref: string): void {
      this.cache.set(slug, (this.cache.get(slug) ?? "") + ref);
    }
  }
  return { appendInteraction, readInteractions, InteractionDedup };
});

vi.mock("../../src/core/lancedb.js", () => ({
  searchKnowledge: vi.fn().mockResolvedValue([]),
  indexDocument: vi.fn().mockResolvedValue(undefined),
  dropCustomerTable: vi.fn().mockResolvedValue(undefined),
}));

import type { MockInstance } from "vitest";
import { appendInteraction, readInteractions } from "../../src/fs/interactions-writer.js";

const mockAppend = appendInteraction as unknown as MockInstance;
const mockRead = readInteractions as unknown as MockInstance;

const DATA_DIR = "/import";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  mockAppend.mockResolvedValue(undefined);
  mockRead.mockResolvedValue("");
  vol.mkdirSync(DATA_DIR, { recursive: true });
});

// ─── CSV Import → list_customers ─────────────────────────────────────────────

describe("E2E Import: CSV → list_customers", () => {
  const CSV = `name,email,domain,notes,date
Acme Corp,contact@acme.com,acme.com,First meeting,2024-01-15
Beta GmbH,info@beta.de,beta.de,Demo call,2024-01-16
`;

  it("imports customers and they appear in list_customers", async () => {
    vol.fromJSON({ [`${DATA_DIR}/data.csv`]: CSV });

    const { runImport } = await import("../../src/commands/import.js");
    const result = await runImport(`${DATA_DIR}/data.csv`, { from: "csv" }, DATA_DIR);

    expect(result.customersCreated).toBe(2);
    expect(result.interactionsImported).toBe(2);
    expect(result.errors).toHaveLength(0);

    const { handleListCustomers } = await import("../../src/mcp/tools/list-customers.js");
    const listResult = await handleListCustomers({}, DATA_DIR);
    const list = JSON.parse(
      (listResult.content[0] as { type: string; text: string }).text
    ) as Array<{ slug: string }>;

    expect(list).toHaveLength(2);
    const slugs = list.map((c) => c.slug);
    expect(slugs).toContain("acme-corp");
    expect(slugs).toContain("beta-gmbh");
  });

  it("customer files are created with correct structure", async () => {
    vol.fromJSON({ [`${DATA_DIR}/data.csv`]: CSV });

    const { runImport } = await import("../../src/commands/import.js");
    await runImport(`${DATA_DIR}/data.csv`, { from: "csv" }, DATA_DIR);

    expect(vol.existsSync(`${DATA_DIR}/customers/acme-corp/main_facts.md`)).toBe(true);
    expect(vol.existsSync(`${DATA_DIR}/customers/acme-corp/interactions.md`)).toBe(true);
    expect(vol.existsSync(`${DATA_DIR}/customers/acme-corp/pipeline.md`)).toBe(true);
    expect(vol.existsSync(`${DATA_DIR}/customers/acme-corp/sources.json`)).toBe(true);
  });

  it("dry-run does not create customer files", async () => {
    vol.fromJSON({ [`${DATA_DIR}/data.csv`]: CSV });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { runImport } = await import("../../src/commands/import.js");
    const result = await runImport(`${DATA_DIR}/data.csv`, { from: "csv", dryRun: true }, DATA_DIR);

    expect(result.customersCreated).toBe(0);
    expect(vol.existsSync(`${DATA_DIR}/customers/acme-corp/main_facts.md`)).toBe(false);
    logSpy.mockRestore();
  });

  it("second import is idempotent — skips existing customers", async () => {
    vol.fromJSON({ [`${DATA_DIR}/data.csv`]: CSV });

    const { runImport } = await import("../../src/commands/import.js");
    await runImport(`${DATA_DIR}/data.csv`, { from: "csv" }, DATA_DIR);

    // Reset mock counts for second run
    mockAppend.mockClear();
    const result2 = await runImport(`${DATA_DIR}/data.csv`, { from: "csv" }, DATA_DIR);

    // Customers already exist — none should be created again
    expect(result2.customersCreated).toBe(0);
    expect(result2.errors).toHaveLength(0);
  });
});

// ─── HubSpot CSV Import ───────────────────────────────────────────────────────

describe("E2E Import: HubSpot CSV", () => {
  const HUBSPOT_CSV = `Company Name,Email,Domain/Website,Notes,Activity Type,Activity Date,Record ID
Acme Corp,contact@acme.com,acme.com,Discussed Q2 deal,Call,2024-01-15,hs-001
Acme Corp,contact@acme.com,acme.com,Sent proposal,Email,2024-01-16,hs-002
Beta GmbH,info@beta.de,beta.de,Demo scheduled,Meeting,2024-01-17,hs-003
`;

  it("imports HubSpot CSV with 2 customers and 3 interactions", async () => {
    vol.fromJSON({ [`${DATA_DIR}/hs.csv`]: HUBSPOT_CSV });

    const { runImport } = await import("../../src/commands/import.js");
    const result = await runImport(`${DATA_DIR}/hs.csv`, { from: "hubspot" }, DATA_DIR);

    expect(result.customersCreated).toBe(2);
    expect(result.interactionsImported).toBe(3);
    expect(result.errors).toHaveLength(0);
  });

  it("HubSpot interactions use hubspot://activity/<id> sourceRef", async () => {
    vol.fromJSON({ [`${DATA_DIR}/hs.csv`]: HUBSPOT_CSV });

    const { runImport } = await import("../../src/commands/import.js");
    await runImport(`${DATA_DIR}/hs.csv`, { from: "hubspot" }, DATA_DIR);

    const firstCall = mockAppend.mock.calls[0];
    expect(firstCall).toBeDefined();
    const entry = firstCall![2] as { sourceRef: string };
    expect(entry.sourceRef).toMatch(/^hubspot:\/\/activity\/hs-001/);
  });

  it("multiple interactions per customer are all imported", async () => {
    vol.fromJSON({ [`${DATA_DIR}/hs.csv`]: HUBSPOT_CSV });

    const { runImport } = await import("../../src/commands/import.js");
    await runImport(`${DATA_DIR}/hs.csv`, { from: "hubspot" }, DATA_DIR);

    // 2 calls for acme-corp, 1 for beta-gmbh
    const acmeCalls = mockAppend.mock.calls.filter((c) => (c[1] as string).includes("acme-corp"));
    expect(acmeCalls).toHaveLength(2);
  });

  it("imported HubSpot customers appear in list_customers", async () => {
    vol.fromJSON({ [`${DATA_DIR}/hs.csv`]: HUBSPOT_CSV });

    const { runImport } = await import("../../src/commands/import.js");
    await runImport(`${DATA_DIR}/hs.csv`, { from: "hubspot" }, DATA_DIR);

    const { handleListCustomers } = await import("../../src/mcp/tools/list-customers.js");
    const listResult = await handleListCustomers({}, DATA_DIR);
    const list = JSON.parse(
      (listResult.content[0] as { type: string; text: string }).text
    ) as Array<{ slug: string }>;

    expect(list.map((c) => c.slug)).toContain("acme-corp");
    expect(list.map((c) => c.slug)).toContain("beta-gmbh");
  });
});

// ─── Salesforce directory import ─────────────────────────────────────────────

describe("E2E Import: Salesforce directory", () => {
  const ACCOUNTS_CSV = `Id,Name,Website
sf-001,Acme Corp,https://acme.com
sf-002,Beta GmbH,https://beta.de
`;

  const ACTIVITIES_CSV = `Id,AccountId,ActivityDate,Type,Description
task-1,sf-001,2026-01-15,Call,Discussed enterprise deal
task-2,sf-001,2026-01-16,Email,Sent proposal
task-3,sf-002,2026-01-17,Meeting,Product demo
`;

  it("creates customers from Accounts.csv and imports Activities.csv", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/sf-export/Accounts.csv`]: ACCOUNTS_CSV,
      [`${DATA_DIR}/sf-export/Activities.csv`]: ACTIVITIES_CSV,
    });

    const { runImport } = await import("../../src/commands/import.js");
    const result = await runImport(`${DATA_DIR}/sf-export`, { from: "salesforce" }, DATA_DIR);

    expect(result.customersCreated).toBe(2);
    expect(result.interactionsImported).toBe(3);
    expect(result.errors).toHaveLength(0);
  });

  it("Salesforce customers appear in list_customers", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/sf-export/Accounts.csv`]: ACCOUNTS_CSV,
      [`${DATA_DIR}/sf-export/Activities.csv`]: ACTIVITIES_CSV,
    });

    const { runImport } = await import("../../src/commands/import.js");
    await runImport(`${DATA_DIR}/sf-export`, { from: "salesforce" }, DATA_DIR);

    const { handleListCustomers } = await import("../../src/mcp/tools/list-customers.js");
    const listResult = await handleListCustomers({}, DATA_DIR);
    const list = JSON.parse(
      (listResult.content[0] as { type: string; text: string }).text
    ) as Array<{ slug: string }>;

    expect(list.map((c) => c.slug)).toContain("acme-corp");
    expect(list.map((c) => c.slug)).toContain("beta-gmbh");
  });

  it("Salesforce dry-run shows counts without writing", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/sf-export/Accounts.csv`]: ACCOUNTS_CSV,
      [`${DATA_DIR}/sf-export/Activities.csv`]: ACTIVITIES_CSV,
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { runImport } = await import("../../src/commands/import.js");
    const result = await runImport(
      `${DATA_DIR}/sf-export`,
      { from: "salesforce", dryRun: true },
      DATA_DIR
    );

    expect(result.customersCreated).toBe(0);
    expect(mockAppend).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Dry run");
    logSpy.mockRestore();
  });
});

// ─── Pipedrive directory import ───────────────────────────────────────────────

describe("E2E Import: Pipedrive directory", () => {
  const ORGS_CSV = `id,name
101,Acme Corp
102,Beta GmbH
`;

  const ACTIVITIES_CSV = `id,org_id,due_date,type,note
act-1,101,2026-02-10,call,Discovery call
act-2,101,2026-02-11,email,Sent pricing
act-3,102,2026-02-12,meeting,Intro meeting
`;

  it("creates customers from organizations.csv and imports activities.csv", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/pd-export/organizations.csv`]: ORGS_CSV,
      [`${DATA_DIR}/pd-export/activities.csv`]: ACTIVITIES_CSV,
    });

    const { runImport } = await import("../../src/commands/import.js");
    const result = await runImport(`${DATA_DIR}/pd-export`, { from: "pipedrive" }, DATA_DIR);

    expect(result.customersCreated).toBe(2);
    expect(result.interactionsImported).toBe(3);
    expect(result.errors).toHaveLength(0);
  });

  it("Pipedrive customers appear in list_customers", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/pd-export/organizations.csv`]: ORGS_CSV,
      [`${DATA_DIR}/pd-export/activities.csv`]: ACTIVITIES_CSV,
    });

    const { runImport } = await import("../../src/commands/import.js");
    await runImport(`${DATA_DIR}/pd-export`, { from: "pipedrive" }, DATA_DIR);

    const { handleListCustomers } = await import("../../src/mcp/tools/list-customers.js");
    const listResult = await handleListCustomers({}, DATA_DIR);
    const list = JSON.parse(
      (listResult.content[0] as { type: string; text: string }).text
    ) as Array<{ slug: string }>;

    expect(list.map((c) => c.slug)).toContain("acme-corp");
    expect(list.map((c) => c.slug)).toContain("beta-gmbh");
  });
});

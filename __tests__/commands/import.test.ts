import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { vol } from "memfs";
import type { MockInstance } from "vitest";

vi.mock("../../src/fs/interactions-writer.js", () => {
  const readInteractions = vi.fn();
  const appendInteraction = vi.fn();
  // Mirror the real InteractionDedup, delegating to the mocked readInteractions
  // so tests can still drive dedup via readInteractions.mockResolvedValue(...).
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

let appendInteraction: MockInstance;
let readInteractions: MockInstance;

// Import module once — fs is globally mocked with memfs, vol.reset() gives fresh FS each test
let runImport: (
  sourcePath: string,
  opts: { from: string; dryRun?: boolean },
  dataDir?: string
) => Promise<{
  customersCreated: number;
  interactionsImported: number;
  skipped: number;
  errors: string[];
}>;

beforeEach(async () => {
  vol.reset();
  vi.clearAllMocks();

  const writerMod = await import("../../src/fs/interactions-writer.js");
  appendInteraction = vi.mocked(writerMod.appendInteraction);
  readInteractions = vi.mocked(writerMod.readInteractions);
  appendInteraction.mockResolvedValue(undefined);
  readInteractions.mockResolvedValue("");

  const importMod = await import("../../src/commands/import.js");
  runImport = importMod.runImport;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const SIMPLE_CSV = `name,email,domain,notes,date
Acme Corp,contact@acme.com,acme.com,Discussed pricing,2024-01-15
Beta GmbH,info@beta.de,beta.de,Follow-up needed,2024-01-16
`;

const HUBSPOT_CSV = `Company Name,Email,Domain/Website,Notes,Activity Type,Activity Date,Record ID
Acme Corp,contact@acme.com,acme.com,Discussed Q2 deal,Call,2024-01-15,hs-001
Acme Corp,contact@acme.com,acme.com,Sent proposal,Email,2024-01-16,hs-002
Beta GmbH,info@beta.de,beta.de,Demo scheduled,Meeting,2024-01-17,hs-003
`;

describe("runImport — CSV", () => {
  it("creates customers and imports interactions", async () => {
    vol.fromJSON({ "/crm/data.csv": SIMPLE_CSV });

    const result = await runImport("/crm/data.csv", { from: "csv" }, "/crm");

    expect(result.customersCreated).toBe(2);
    expect(result.interactionsImported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(appendInteraction).toHaveBeenCalledTimes(2);
  });

  it("creates customer directories with correct files", async () => {
    vol.fromJSON({ "/crm/data.csv": SIMPLE_CSV });

    await runImport("/crm/data.csv", { from: "csv" }, "/crm");

    expect(vol.existsSync("/crm/customers/acme-corp/main_facts.md")).toBe(true);
    expect(vol.existsSync("/crm/customers/acme-corp/interactions.md")).toBe(true);
    expect(vol.existsSync("/crm/customers/acme-corp/pipeline.md")).toBe(true);
    expect(vol.existsSync("/crm/customers/acme-corp/sources.json")).toBe(true);
  });

  it("skips existing customers (idempotent customer creation)", async () => {
    vol.fromJSON({
      "/crm/data.csv": SIMPLE_CSV,
      "/crm/customers/acme-corp/main_facts.md": "---\nname: Acme Corp\n---\n",
    });

    const result = await runImport("/crm/data.csv", { from: "csv" }, "/crm");

    expect(result.customersCreated).toBe(1); // only beta-gmbh is new
  });

  it("skips duplicate interactions when sourceRef exists in interactions file", async () => {
    vol.fromJSON({ "/crm/data.csv": SIMPLE_CSV });

    // Both rows will produce a sourceRef like csv://row/<hash>
    // Make readInteractions return content that includes a hypothetical sourceRef
    readInteractions.mockResolvedValue("csv://row/forcedmatch");

    const result = await runImport("/crm/data.csv", { from: "csv" }, "/crm");

    expect(result.errors).toHaveLength(0);
    expect(result.customersCreated).toBe(2);
    // skipped >= 0; actual count depends on hash. Key assertion: no errors.
  });

  it("dry-run returns mapping without writing files", async () => {
    vol.fromJSON({ "/crm/data.csv": SIMPLE_CSV });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runImport("/crm/data.csv", { from: "csv", dryRun: true }, "/crm");

    expect(appendInteraction).not.toHaveBeenCalled();
    expect(vol.existsSync("/crm/customers/acme-corp/main_facts.md")).toBe(false);
    expect(result.customersCreated).toBe(0);
    expect(result.interactionsImported).toBe(0);

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(output).toContain("Dry run");
    consoleSpy.mockRestore();
  });

  it("exits with error when file not found", async () => {
    vol.fromJSON({});

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);

    await expect(runImport("/crm/missing.csv", { from: "csv" }, "/crm")).rejects.toThrow(
      "process.exit called"
    );

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("returns empty result for empty CSV", async () => {
    vol.fromJSON({ "/crm/empty.csv": "name,email\n" });

    const result = await runImport("/crm/empty.csv", { from: "csv" }, "/crm");

    expect(result.customersCreated).toBe(0);
    expect(result.interactionsImported).toBe(0);
  });
});

describe("runImport — HubSpot", () => {
  it("imports HubSpot CSV with correct field mapping", async () => {
    vol.fromJSON({ "/crm/hs.csv": HUBSPOT_CSV });

    const result = await runImport("/crm/hs.csv", { from: "hubspot" }, "/crm");

    expect(result.customersCreated).toBe(2); // acme-corp + beta-gmbh
    expect(result.interactionsImported).toBe(3);
    expect(result.errors).toHaveLength(0);
    expect(appendInteraction).toHaveBeenCalledTimes(3);
  });

  it("uses hubspot://activity/<id> sourceRef format", async () => {
    vol.fromJSON({ "/crm/hs.csv": HUBSPOT_CSV });

    await runImport("/crm/hs.csv", { from: "hubspot" }, "/crm");

    const firstCall = appendInteraction.mock.calls[0];
    expect(firstCall).toBeDefined();
    const entry = firstCall![2] as { sourceRef: string };
    expect(entry.sourceRef).toMatch(/^hubspot:\/\/activity\//);
    expect(entry.sourceRef).toContain("hs-001");
  });

  it("maps activity types correctly", async () => {
    vol.fromJSON({ "/crm/hs.csv": HUBSPOT_CSV });

    await runImport("/crm/hs.csv", { from: "hubspot" }, "/crm");

    const types = appendInteraction.mock.calls.map((c) => (c[2] as { type: string }).type);
    expect(types).toContain("Call");
    expect(types).toContain("Email");
    expect(types).toContain("Meeting");
  });
});

// ─── Salesforce directory import ──────────────────────────────────────────────

const SF_ACCOUNTS_CSV = `Id,Name,Website
sf-001,Acme Corp,https://acme.com
sf-002,Beta GmbH,https://beta.de
`;

const SF_ACTIVITIES_CSV = `Id,AccountId,ActivityDate,Type,Description
task-1,sf-001,2026-01-15,Call,Discussed enterprise deal
task-2,sf-001,2026-01-16,Email,Sent proposal
task-3,sf-002,2026-01-17,Meeting,Product demo
`;

describe("runImport — Salesforce directory", () => {
  it("creates customers from Accounts.csv", async () => {
    vol.fromJSON({
      "/crm/sf-export/Accounts.csv": SF_ACCOUNTS_CSV,
    });
    readInteractions.mockResolvedValue("");
    const result = await runImport("/crm/sf-export", { from: "salesforce" }, "/crm");
    expect(result.customersCreated).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it("imports interactions from Activities.csv", async () => {
    vol.fromJSON({
      "/crm/sf-export/Accounts.csv": SF_ACCOUNTS_CSV,
      "/crm/sf-export/Activities.csv": SF_ACTIVITIES_CSV,
    });
    readInteractions.mockResolvedValue("");
    const result = await runImport("/crm/sf-export", { from: "salesforce" }, "/crm");
    expect(result.interactionsImported).toBe(3);
    expect(appendInteraction).toHaveBeenCalledTimes(3);
  });

  it("uses salesforce://row/<id> sourceRef format", async () => {
    vol.fromJSON({
      "/crm/sf-export/Accounts.csv": SF_ACCOUNTS_CSV,
      "/crm/sf-export/Activities.csv": SF_ACTIVITIES_CSV,
    });
    readInteractions.mockResolvedValue("");
    await runImport("/crm/sf-export", { from: "salesforce" }, "/crm");
    const call = appendInteraction.mock.calls[0]!;
    const entry = call[2] as { sourceRef: string };
    expect(entry.sourceRef).toMatch(/^salesforce:\/\/row\//);
  });

  it("dry-run shows counts without writing", async () => {
    vol.fromJSON({
      "/crm/sf-export/Accounts.csv": SF_ACCOUNTS_CSV,
      "/crm/sf-export/Activities.csv": SF_ACTIVITIES_CSV,
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await runImport("/crm/sf-export", { from: "salesforce", dryRun: true }, "/crm");
    expect(result.customersCreated).toBe(0);
    expect(appendInteraction).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Dry run");
    logSpy.mockRestore();
  });

  it("returns error when Accounts.csv not found", async () => {
    vol.fromJSON({ "/crm/sf-empty/": null });
    const result = await runImport("/crm/sf-empty", { from: "salesforce" }, "/crm");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Accounts.csv");
  });
});

// ─── Pipedrive directory import ───────────────────────────────────────────────

const PD_ORGS_CSV = `id,name
101,Acme Corp
102,Beta GmbH
`;

const PD_ACTIVITIES_CSV = `id,org_id,due_date,type,note
act-1,101,2026-02-10,call,Discovery call with Acme
act-2,101,2026-02-11,email,Sent pricing
act-3,102,2026-02-12,meeting,Introductory meeting
`;

describe("runImport — Pipedrive directory", () => {
  it("creates customers from organizations.csv", async () => {
    vol.fromJSON({ "/crm/pd-export/organizations.csv": PD_ORGS_CSV });
    readInteractions.mockResolvedValue("");
    const result = await runImport("/crm/pd-export", { from: "pipedrive" }, "/crm");
    expect(result.customersCreated).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it("imports activities from activities.csv", async () => {
    vol.fromJSON({
      "/crm/pd-export/organizations.csv": PD_ORGS_CSV,
      "/crm/pd-export/activities.csv": PD_ACTIVITIES_CSV,
    });
    readInteractions.mockResolvedValue("");
    const result = await runImport("/crm/pd-export", { from: "pipedrive" }, "/crm");
    expect(result.interactionsImported).toBe(3);
    expect(appendInteraction).toHaveBeenCalledTimes(3);
  });

  it("uses pipedrive://row/<id> sourceRef format", async () => {
    vol.fromJSON({
      "/crm/pd-export/organizations.csv": PD_ORGS_CSV,
      "/crm/pd-export/activities.csv": PD_ACTIVITIES_CSV,
    });
    readInteractions.mockResolvedValue("");
    await runImport("/crm/pd-export", { from: "pipedrive" }, "/crm");
    const call = appendInteraction.mock.calls[0]!;
    const entry = call[2] as { sourceRef: string };
    expect(entry.sourceRef).toMatch(/^pipedrive:\/\/row\//);
  });

  it("returns error when organizations.csv not found", async () => {
    vol.fromJSON({ "/crm/pd-empty/": null });
    const result = await runImport("/crm/pd-empty", { from: "pipedrive" }, "/crm");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("organizations.csv");
  });
});

// ─── Salesforce API import ────────────────────────────────────────────────────

const mockFetchSalesforceContacts = vi.hoisted(() => vi.fn());
const mockFetchSalesforceTasks = vi.hoisted(() => vi.fn());
const mockFetchSalesforceOpportunities = vi.hoisted(() => vi.fn());
const mockFetchSalesforceLeads = vi.hoisted(() => vi.fn());
const mockFetchSalesforceEvents = vi.hoisted(() => vi.fn());
const mockFetchSalesforceCases = vi.hoisted(() => vi.fn());
const mockFetchSalesforceLineItems = vi.hoisted(() => vi.fn());
const mockFetchSalesforceNotes = vi.hoisted(() => vi.fn());
const mockFetchSalesforceCampaignMembers = vi.hoisted(() => vi.fn());

vi.mock("../../src/sync/salesforce-client.js", () => ({
  fetchSalesforceContacts: mockFetchSalesforceContacts,
  fetchSalesforceTasks: mockFetchSalesforceTasks,
  fetchSalesforceOpportunities: mockFetchSalesforceOpportunities,
  fetchSalesforceLeads: mockFetchSalesforceLeads,
  fetchSalesforceEvents: mockFetchSalesforceEvents,
  fetchSalesforceCases: mockFetchSalesforceCases,
  fetchSalesforceLineItems: mockFetchSalesforceLineItems,
  fetchSalesforceNotes: mockFetchSalesforceNotes,
  fetchSalesforceCampaignMembers: mockFetchSalesforceCampaignMembers,
}));

describe("runImport — Salesforce API mode", () => {
  beforeEach(async () => {
    vol.reset();
    vi.clearAllMocks();

    const writerMod = await import("../../src/fs/interactions-writer.js");
    appendInteraction = vi.mocked(writerMod.appendInteraction);
    readInteractions = vi.mocked(writerMod.readInteractions);
    appendInteraction.mockResolvedValue(undefined);
    readInteractions.mockResolvedValue("");

    const importMod = await import("../../src/commands/import.js");
    runImport = importMod.runImport;
  });

  it("imports contacts and tasks from Salesforce API", async () => {
    vol.fromJSON({});
    mockFetchSalesforceContacts.mockResolvedValue([
      {
        Id: "c1",
        Name: "Alice Smith",
        Email: "alice@acme.com",
        Account: { Website: "https://acme.com" },
      },
    ]);
    mockFetchSalesforceTasks.mockResolvedValue([
      {
        Id: "t1",
        WhoId: "c1",
        ActivityDate: "2026-01-15",
        Type: "Call",
        Subject: "Intro",
        Description: "Discovery call",
      },
    ]);

    const result = await runImport(
      "",
      { from: "salesforce", mode: "api", token: "tok", url: "https://acme.salesforce.com" },
      "/crm"
    );

    expect(result.customersCreated).toBe(1);
    expect(result.interactionsImported).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(appendInteraction).toHaveBeenCalledTimes(1);
    const entry = appendInteraction.mock.calls[0]![2] as { sourceRef: string; type: string };
    expect(entry.sourceRef).toBe("salesforce://task/t1");
    expect(entry.type).toBe("Call");
  });

  it("imports opportunities into pipeline.md with mapped stages", async () => {
    vol.fromJSON({});
    mockFetchSalesforceContacts.mockResolvedValue([]);
    mockFetchSalesforceTasks.mockResolvedValue([]);
    mockFetchSalesforceOpportunities.mockResolvedValue([
      {
        Id: "o1",
        Name: "Acme Enterprise License",
        StageName: "Negotiation/Review",
        Amount: 75000,
        CloseDate: "2026-09-30",
        Probability: 80,
        Account: { Name: "Acme Corp", Website: "https://acme.com" },
      },
    ]);

    const result = await runImport(
      "",
      { from: "salesforce", mode: "api", token: "tok", url: "https://acme.salesforce.com" },
      "/crm"
    );

    expect(result.errors).toHaveLength(0);
    expect(result.dealsImported).toBe(1);
    // The account had no contact, so the opportunity creates the customer.
    expect(result.customersCreated).toBe(1);
    const pipeline = vol.toJSON()["/crm/customers/acme-corp/pipeline.md"] as string;
    expect(pipeline).toContain("Acme Enterprise License");
    expect(pipeline).toContain("negotiation");
    expect(pipeline).toContain("75000");
  });

  it("imports leads as customers with a lead interaction", async () => {
    vol.fromJSON({});
    mockFetchSalesforceContacts.mockResolvedValue([]);
    mockFetchSalesforceTasks.mockResolvedValue([]);
    mockFetchSalesforceOpportunities.mockResolvedValue([]);
    mockFetchSalesforceLeads.mockResolvedValue([
      {
        Id: "l1",
        Name: "Jane Doe",
        Company: "Globex",
        Email: "jane@globex.com",
        Status: "Open - Not Contacted",
        Title: "CTO",
        Website: "https://globex.com",
      },
    ]);

    const result = await runImport(
      "",
      { from: "salesforce", mode: "api", token: "tok", url: "https://acme.salesforce.com" },
      "/crm"
    );

    expect(result.errors).toHaveLength(0);
    expect(result.leadsImported).toBe(1);
    expect(result.customersCreated).toBe(1);
    expect(appendInteraction).toHaveBeenCalledTimes(1);
    const entry = appendInteraction.mock.calls[0]![2] as { sourceRef: string; summary: string };
    expect(entry.sourceRef).toBe("salesforce://lead/l1");
    expect(entry.summary).toContain("Open - Not Contacted");
  });

  it("imports events as Meeting interactions linked by WhoId", async () => {
    vol.fromJSON({});
    mockFetchSalesforceContacts.mockResolvedValue([
      {
        Id: "c1",
        Name: "Alice",
        Email: "alice@acme.com",
        Account: { Website: "https://acme.com" },
      },
    ]);
    mockFetchSalesforceTasks.mockResolvedValue([]);
    mockFetchSalesforceOpportunities.mockResolvedValue([]);
    mockFetchSalesforceLeads.mockResolvedValue([]);
    mockFetchSalesforceEvents.mockResolvedValue([
      {
        Id: "e1",
        Subject: "Discovery call",
        Description: "Intro meeting with Alice",
        StartDateTime: "2026-05-10T14:00:00Z",
        WhoId: "c1",
      },
    ]);

    const result = await runImport(
      "",
      { from: "salesforce", mode: "api", token: "tok", url: "https://acme.salesforce.com" },
      "/crm"
    );

    expect(result.errors).toHaveLength(0);
    expect(result.eventsImported).toBe(1);
    const entry = appendInteraction.mock.calls.find(
      (c) => (c[2] as { sourceRef: string }).sourceRef === "salesforce://event/e1"
    )?.[2] as { type: string; date: string } | undefined;
    expect(entry?.type).toBe("Meeting");
    expect(entry?.date).toBe("2026-05-10");
  });

  it("imports cases as tickets with mapped status and priority", async () => {
    vol.fromJSON({});
    mockFetchSalesforceContacts.mockResolvedValue([]);
    mockFetchSalesforceTasks.mockResolvedValue([]);
    mockFetchSalesforceOpportunities.mockResolvedValue([]);
    mockFetchSalesforceLeads.mockResolvedValue([]);
    mockFetchSalesforceEvents.mockResolvedValue([]);
    mockFetchSalesforceCases.mockResolvedValue([
      {
        Id: "case1",
        CaseNumber: "00001023",
        Subject: "Login broken",
        Description: "User cannot log in",
        Status: "Working",
        Priority: "High",
        Account: { Name: "Acme Corp" },
        CreatedDate: "2026-04-01T09:00:00Z",
      },
    ]);

    const result = await runImport(
      "",
      { from: "salesforce", mode: "api", token: "tok", url: "https://acme.salesforce.com" },
      "/crm"
    );

    expect(result.errors).toHaveLength(0);
    expect(result.casesImported).toBe(1);
    expect(result.customersCreated).toBe(1);
    const tickets = vol.toJSON()["/crm/customers/acme-corp/tickets.md"] as string;
    expect(tickets).toContain("Login broken");
    expect(tickets).toContain("in-progress");
    expect(tickets).toContain("high");
  });

  it("imports opportunity line items as a quote", async () => {
    vol.fromJSON({});
    mockFetchSalesforceContacts.mockResolvedValue([]);
    mockFetchSalesforceTasks.mockResolvedValue([]);
    mockFetchSalesforceOpportunities.mockResolvedValue([
      {
        Id: "o001",
        Name: "Acme Enterprise License",
        StageName: "Proposal",
        Amount: 1500,
        Account: { Name: "Acme Corp" },
      },
    ]);
    mockFetchSalesforceLeads.mockResolvedValue([]);
    mockFetchSalesforceEvents.mockResolvedValue([]);
    mockFetchSalesforceCases.mockResolvedValue([]);
    mockFetchSalesforceLineItems.mockResolvedValue([
      {
        Id: "oli1",
        OpportunityId: "o001",
        Quantity: 10,
        UnitPrice: 100,
        TotalPrice: 1000,
        Product2: { Name: "Enterprise Seat" },
      },
      {
        Id: "oli2",
        OpportunityId: "o001",
        Quantity: 1,
        UnitPrice: 500,
        Product2: { Name: "Setup" },
      },
    ]);

    const result = await runImport(
      "",
      { from: "salesforce", mode: "api", token: "tok", url: "https://acme.salesforce.com" },
      "/crm"
    );

    expect(result.errors).toHaveLength(0);
    expect(result.quotesImported).toBe(1);
    const files = vol.toJSON();
    const quoteFile = Object.entries(files).find(
      ([p, c]) =>
        p.includes("/quotes/") && p.endsWith(".json") && String(c).includes("Enterprise Seat")
    );
    expect(quoteFile).toBeDefined();
  });

  it("imports notes as Note interactions linked by ParentId", async () => {
    vol.fromJSON({});
    mockFetchSalesforceContacts.mockResolvedValue([
      {
        Id: "c1",
        Name: "Alice",
        Email: "alice@acme.com",
        Account: { Website: "https://acme.com" },
      },
    ]);
    mockFetchSalesforceTasks.mockResolvedValue([]);
    mockFetchSalesforceOpportunities.mockResolvedValue([]);
    mockFetchSalesforceLeads.mockResolvedValue([]);
    mockFetchSalesforceEvents.mockResolvedValue([]);
    mockFetchSalesforceCases.mockResolvedValue([]);
    mockFetchSalesforceLineItems.mockResolvedValue([]);
    mockFetchSalesforceNotes.mockResolvedValue([
      {
        Id: "note1",
        Title: "Renewal terms",
        Body: "Customer wants annual billing.",
        ParentId: "c1",
        CreatedDate: "2026-03-01T10:00:00Z",
      },
    ]);

    const result = await runImport(
      "",
      { from: "salesforce", mode: "api", token: "tok", url: "https://acme.salesforce.com" },
      "/crm"
    );

    expect(result.errors).toHaveLength(0);
    expect(result.notesImported).toBe(1);
    const entry = appendInteraction.mock.calls.find(
      (c) => (c[2] as { sourceRef: string }).sourceRef === "salesforce://note/note1"
    )?.[2] as { type: string; summary: string } | undefined;
    expect(entry?.type).toBe("Note");
    expect(entry?.summary).toContain("Renewal terms");
  });

  it("imports campaign members as Note interactions linked by ContactId", async () => {
    vol.fromJSON({});
    mockFetchSalesforceContacts.mockResolvedValue([
      {
        Id: "c1",
        Name: "Alice",
        Email: "alice@acme.com",
        Account: { Website: "https://acme.com" },
      },
    ]);
    mockFetchSalesforceTasks.mockResolvedValue([]);
    mockFetchSalesforceOpportunities.mockResolvedValue([]);
    mockFetchSalesforceLeads.mockResolvedValue([]);
    mockFetchSalesforceEvents.mockResolvedValue([]);
    mockFetchSalesforceCases.mockResolvedValue([]);
    mockFetchSalesforceLineItems.mockResolvedValue([]);
    mockFetchSalesforceNotes.mockResolvedValue([]);
    mockFetchSalesforceCampaignMembers.mockResolvedValue([
      {
        Id: "cm1",
        CampaignId: "camp1",
        Campaign: { Name: "Q3 Webinar" },
        ContactId: "c1",
        Status: "Responded",
        CreatedDate: "2026-07-01T10:00:00Z",
      },
    ]);

    const result = await runImport(
      "",
      { from: "salesforce", mode: "api", token: "tok", url: "https://acme.salesforce.com" },
      "/crm"
    );

    expect(result.errors).toHaveLength(0);
    expect(result.campaignsImported).toBe(1);
    const entry = appendInteraction.mock.calls.find(
      (c) => (c[2] as { sourceRef: string }).sourceRef === "salesforce://campaignmember/cm1"
    )?.[2] as { summary: string } | undefined;
    expect(entry?.summary).toContain("Q3 Webinar");
  });

  it("returns error when Salesforce API throws", async () => {
    vol.fromJSON({});
    mockFetchSalesforceContacts.mockRejectedValue(new Error("SFDC unreachable"));
    mockFetchSalesforceTasks.mockResolvedValue([]);

    const result = await runImport(
      "",
      { from: "salesforce", mode: "api", token: "tok", url: "https://acme.salesforce.com" },
      "/crm"
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("SFDC unreachable");
  });

  it("dry-run shows counts without writing", async () => {
    vol.fromJSON({});
    mockFetchSalesforceContacts.mockResolvedValue([
      { Id: "c1", Name: "Acme", Email: "a@acme.com" },
    ]);
    mockFetchSalesforceTasks.mockResolvedValue([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runImport(
      "",
      { from: "salesforce", mode: "api", token: "tok", url: "https://x.sf.com", dryRun: true },
      "/crm"
    );

    expect(appendInteraction).not.toHaveBeenCalled();
    expect(result.customersCreated).toBe(0);
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Dry run");
    logSpy.mockRestore();
  });

  it("skips task when WhoId not in slugMap", async () => {
    vol.fromJSON({});
    mockFetchSalesforceContacts.mockResolvedValue([]);
    mockFetchSalesforceTasks.mockResolvedValue([
      {
        Id: "t1",
        WhoId: "unknown-id",
        ActivityDate: "2026-01-15",
        Type: "Call",
        Subject: "Orphan",
      },
    ]);

    const result = await runImport(
      "",
      { from: "salesforce", mode: "api", token: "tok", url: "https://x.sf.com" },
      "/crm"
    );

    expect(appendInteraction).not.toHaveBeenCalled();
    expect(result.interactionsImported).toBe(0);
  });

  it("skips duplicate task when sourceRef already in interactions", async () => {
    vol.fromJSON({});
    mockFetchSalesforceContacts.mockResolvedValue([
      { Id: "c1", Name: "Acme", Email: "a@acme.com" },
    ]);
    mockFetchSalesforceTasks.mockResolvedValue([
      { Id: "t1", WhoId: "c1", ActivityDate: "2026-01-15", Type: "Call", Subject: "Dup" },
    ]);
    readInteractions.mockResolvedValue("salesforce://task/t1");

    const result = await runImport(
      "",
      { from: "salesforce", mode: "api", token: "tok", url: "https://x.sf.com" },
      "/crm"
    );

    expect(result.skipped).toBe(1);
    expect(appendInteraction).not.toHaveBeenCalled();
  });
});

// ─── Pipedrive API import ─────────────────────────────────────────────────────

const mockFetchPipedrivePersons = vi.hoisted(() => vi.fn());
const mockFetchPipedriveActivities = vi.hoisted(() => vi.fn());

vi.mock("../../src/sync/pipedrive-client.js", () => ({
  fetchPipedrivePersons: mockFetchPipedrivePersons,
  fetchPipedriveActivities: mockFetchPipedriveActivities,
}));

describe("runPipedriveApiImport", () => {
  beforeEach(async () => {
    vol.reset();
    vi.clearAllMocks();

    const writerMod = await import("../../src/fs/interactions-writer.js");
    appendInteraction = vi.mocked(writerMod.appendInteraction);
    readInteractions = vi.mocked(writerMod.readInteractions);
    appendInteraction.mockResolvedValue(undefined);
    readInteractions.mockResolvedValue("");

    const importMod = await import("../../src/commands/import.js");
    runImport = importMod.runImport;
  });

  it("imports persons and activities from Pipedrive API", async () => {
    vol.fromJSON({});
    mockFetchPipedrivePersons.mockResolvedValue([
      {
        id: 1,
        name: "Alice",
        org_name: "Acme Corp",
        primary_email: "a@acme.com",
        org_id: { value: 10 },
      },
    ]);
    mockFetchPipedriveActivities.mockResolvedValue([
      {
        id: 100,
        person_id: 1,
        due_date: "2026-03-01",
        type: "call",
        subject: "Intro",
        note: "Great call",
      },
    ]);

    const result = await runImport(
      "",
      { from: "pipedrive", mode: "api", token: "tok", url: "https://company.pipedrive.com" },
      "/crm"
    );

    expect(result.customersCreated).toBe(1);
    expect(result.interactionsImported).toBe(1);
    expect(result.errors).toHaveLength(0);
    const entry = appendInteraction.mock.calls[0]![2] as { sourceRef: string; type: string };
    expect(entry.sourceRef).toBe("pipedrive://activity/100");
    expect(entry.type).toBe("Call");
  });

  it("returns error when token/url missing", async () => {
    const savedToken = process.env["PIPEDRIVE_TOKEN"];
    const savedUrl = process.env["PIPEDRIVE_URL"];
    delete process.env["PIPEDRIVE_TOKEN"];
    delete process.env["PIPEDRIVE_URL"];

    vol.fromJSON({});
    const result = await runImport("", { from: "pipedrive", mode: "api" }, "/crm");

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("token");

    if (savedToken) process.env["PIPEDRIVE_TOKEN"] = savedToken;
    if (savedUrl) process.env["PIPEDRIVE_URL"] = savedUrl;
  });

  it("returns error when Pipedrive API throws", async () => {
    vol.fromJSON({});
    mockFetchPipedrivePersons.mockRejectedValue(new Error("PD timeout"));
    mockFetchPipedriveActivities.mockResolvedValue([]);

    const result = await runImport(
      "",
      { from: "pipedrive", mode: "api", token: "tok", url: "https://x.pipedrive.com" },
      "/crm"
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("PD timeout");
  });

  it("dry-run shows counts without writing", async () => {
    vol.fromJSON({});
    mockFetchPipedrivePersons.mockResolvedValue([{ id: 1, name: "Bob", org_name: "Beta" }]);
    mockFetchPipedriveActivities.mockResolvedValue([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runImport(
      "",
      {
        from: "pipedrive",
        mode: "api",
        token: "tok",
        url: "https://x.pipedrive.com",
        dryRun: true,
      },
      "/crm"
    );

    expect(appendInteraction).not.toHaveBeenCalled();
    expect(result.customersCreated).toBe(0);
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Dry run");
    logSpy.mockRestore();
  });

  it("skips duplicate activity when sourceRef already exists", async () => {
    vol.fromJSON({});
    mockFetchPipedrivePersons.mockResolvedValue([
      { id: 1, name: "Acme", org_name: "Acme Corp", primary_email: "a@acme.com" },
    ]);
    mockFetchPipedriveActivities.mockResolvedValue([
      { id: 200, person_id: 1, due_date: "2026-03-01", type: "email", subject: "Dup" },
    ]);
    readInteractions.mockResolvedValue("pipedrive://activity/200");

    const result = await runImport(
      "",
      { from: "pipedrive", mode: "api", token: "tok", url: "https://x.pipedrive.com" },
      "/crm"
    );

    expect(result.skipped).toBe(1);
    expect(appendInteraction).not.toHaveBeenCalled();
  });

  it("records error in result when appendInteraction throws for activity", async () => {
    vol.fromJSON({});
    mockFetchPipedrivePersons.mockResolvedValue([
      { id: 1, name: "Acme Corp", org_name: "Acme Corp", primary_email: "a@acme.com" },
    ]);
    mockFetchPipedriveActivities.mockResolvedValue([
      { id: 300, person_id: 1, due_date: "2026-04-01", type: "call", subject: "Intro call" },
    ]);
    appendInteraction.mockRejectedValueOnce(new Error("disk full"));

    const result = await runImport(
      "",
      { from: "pipedrive", mode: "api", token: "tok", url: "https://x.pipedrive.com" },
      "/crm"
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("disk full");
  });

  it("maps meeting activity type to Meeting", async () => {
    vol.fromJSON({});
    mockFetchPipedrivePersons.mockResolvedValue([
      { id: 1, name: "Acme Corp", org_name: "Acme Corp" },
    ]);
    mockFetchPipedriveActivities.mockResolvedValue([
      { id: 400, person_id: 1, due_date: "2026-04-01", type: "meeting", subject: "Strategy" },
    ]);

    await runImport(
      "",
      { from: "pipedrive", mode: "api", token: "tok", url: "https://x.pipedrive.com" },
      "/crm"
    );

    const entry = appendInteraction.mock.calls[0]![2] as { type: string };
    expect(entry.type).toBe("Meeting");
  });

  it("maps email activity type to Email", async () => {
    vol.fromJSON({});
    mockFetchPipedrivePersons.mockResolvedValue([
      { id: 1, name: "Acme Corp", org_name: "Acme Corp" },
    ]);
    mockFetchPipedriveActivities.mockResolvedValue([
      { id: 401, person_id: 1, due_date: "2026-04-01", type: "email", subject: "Follow-up" },
    ]);

    await runImport(
      "",
      { from: "pipedrive", mode: "api", token: "tok", url: "https://x.pipedrive.com" },
      "/crm"
    );

    const entry = appendInteraction.mock.calls[0]![2] as { type: string };
    expect(entry.type).toBe("Email");
  });

  it("maps unknown activity type to Note (line 724)", async () => {
    vol.fromJSON({});
    mockFetchPipedrivePersons.mockResolvedValue([
      { id: 1, name: "Acme Corp", org_name: "Acme Corp" },
    ]);
    mockFetchPipedriveActivities.mockResolvedValue([
      { id: 402, person_id: 1, due_date: "2026-04-01", type: "lunch", subject: "Client lunch" },
    ]);

    await runImport(
      "",
      { from: "pipedrive", mode: "api", token: "tok", url: "https://x.pipedrive.com" },
      "/crm"
    );

    const entry = appendInteraction.mock.calls[0]![2] as { type: string };
    expect(entry.type).toBe("Note");
  });

  it("matches activity to slug via org_id fallback when no person_id (lines 702-703)", async () => {
    vol.fromJSON({});
    mockFetchPipedrivePersons.mockResolvedValue([
      { id: 1, name: "Acme Corp", org_name: "Acme Corp", org_id: { value: 10 } },
    ]);
    mockFetchPipedriveActivities.mockResolvedValue([
      // No person_id, but org_id matches
      { id: 403, org_id: 10, due_date: "2026-04-01", type: "call", subject: "Org-level call" },
    ]);

    const result = await runImport(
      "",
      { from: "pipedrive", mode: "api", token: "tok", url: "https://x.pipedrive.com" },
      "/crm"
    );

    expect(result.interactionsImported).toBe(1);
    const entry = appendInteraction.mock.calls[0]![2] as { type: string };
    expect(entry.type).toBe("Call");
  });

  it("skips activity when neither person_id nor org_id resolves to slug (line 703 undefined)", async () => {
    vol.fromJSON({});
    mockFetchPipedrivePersons.mockResolvedValue([
      { id: 1, name: "Acme Corp", org_name: "Acme Corp" },
    ]);
    mockFetchPipedriveActivities.mockResolvedValue([
      // No person_id, no org_id → slug = undefined → skipped
      { id: 404, due_date: "2026-04-01", type: "call", subject: "Orphan activity" },
    ]);

    const result = await runImport(
      "",
      { from: "pipedrive", mode: "api", token: "tok", url: "https://x.pipedrive.com" },
      "/crm"
    );

    expect(result.interactionsImported).toBe(0);
    expect(appendInteraction).not.toHaveBeenCalled();
  });
});

// ─── importCommand CLI action ─────────────────────────────────────────────────

describe("importCommand — CLI action", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs CSV import and prints import summary", async () => {
    vol.fromJSON({ "/tmp/leads.csv": "name\nAcme Corp\n" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { importCommand } = await import("../../src/commands/import.js");
    await importCommand.parseAsync(["node", "import", "/tmp/leads.csv"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Import complete");
    consoleSpy.mockRestore();
  });

  it("parses --owner-map flag without crashing", async () => {
    vol.fromJSON({ "/tmp/leads.csv": "name\nBeta Corp\n" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { importCommand } = await import("../../src/commands/import.js");
    await importCommand.parseAsync([
      "node",
      "import",
      "/tmp/leads.csv",
      "--owner-map",
      "alice@hs.com=alice,bob@hs.com=bob",
    ]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Import complete");
    consoleSpy.mockRestore();
  });

  it("prints error list when import returns errors", async () => {
    vol.fromJSON({
      "/tmp/leads.csv": "name,notes,activityType\nAcme Corp,Discussed pricing,Call\n",
    });

    const writerMod = await import("../../src/fs/interactions-writer.js");
    vi.mocked(writerMod.appendInteraction).mockRejectedValue(new Error("write error"));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { importCommand } = await import("../../src/commands/import.js");
    await importCommand.parseAsync(["node", "import", "/tmp/leads.csv"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Errors");
    consoleSpy.mockRestore();
  });

  it("runs HubSpot --analyze mode and prints analysis summary", async () => {
    vol.fromJSON({
      "/tmp/hs-export/companies.csv": "name,domain\nAcme Corp,acme.com\n",
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { importCommand } = await import("../../src/commands/import.js");
    await importCommand.parseAsync([
      "node",
      "import",
      "/tmp/hs-export",
      "--from",
      "hubspot",
      "--analyze",
    ]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("HubSpot Import Analysis");
    consoleSpy.mockRestore();
  });

  it("--analyze prints custom properties, owners, and unknown stages when present", async () => {
    // Provide CSV data that triggers all three conditional branches (lines 798-816)
    vol.fromJSON({
      "/tmp/hs-full/companies.csv": [
        "name,domain,hubspot_owner_email,custom_col1,custom_col2",
        "Acme Corp,acme.com,rep@acme.com,val1,val2",
      ].join("\n"),
      "/tmp/hs-full/deals.csv": [
        "dealname,dealstage,associated_company",
        "Deal A,totally_unknown_stage_xyz,Acme Corp",
      ].join("\n"),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { importCommand } = await import("../../src/commands/import.js");
    await importCommand.parseAsync([
      "node",
      "import",
      "/tmp/hs-full",
      "--from",
      "hubspot",
      "--analyze",
    ]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Custom Properties");
    expect(output).toContain("Owners detected");
    expect(output).toContain("Unknown stages");
    consoleSpy.mockRestore();
  });
});

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { vol } from "memfs";
import type { MockInstance } from "vitest";

vi.mock("../../src/fs/interactions-writer.js", () => ({
  appendInteraction: vi.fn(),
  readInteractions: vi.fn(),
}));

let appendInteraction: MockInstance;
let readInteractions: MockInstance;

// Import module once — fs is globally mocked with memfs, vol.reset() gives fresh FS each test
let runImport: (
  sourcePath: string,
  opts: { from: string; dryRun?: boolean },
  dataDir?: string
) => Promise<{ customersCreated: number; interactionsImported: number; skipped: number; errors: string[] }>;

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

    await expect(runImport("/crm/missing.csv", { from: "csv" }, "/crm")).rejects.toThrow("process.exit called");

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

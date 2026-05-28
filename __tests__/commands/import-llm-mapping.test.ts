import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

const mockMapCsvFields = vi.hoisted(() => vi.fn());

vi.mock("../../src/core/llm.js", () => ({
  mapCsvFields: mockMapCsvFields,
  mapCsvFieldsHeuristic: vi.fn(),
}));

describe("import — LLM field mapping integration", () => {
  const DATA_DIR = "/test-crm";

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vol.reset();

    // Default: LLM returns a usable mapping
    mockMapCsvFields.mockResolvedValue({
      name: "Company",
      email: "Email",
      domain: "Website",
      notes: "Notes",
      date: "Activity Date",
      activityType: "Activity Type",
      sourceId: "Record ID",
    });
  });

  async function getRunImport() {
    const mod = await import("../../src/commands/import.js");
    return mod.runImport;
  }

  function setupCrm() {
    vol.mkdirSync(`${DATA_DIR}/customers`, { recursive: true });
  }

  const SAMPLE_CSV = [
    "Company,Email,Website,Notes,Activity Type,Activity Date,Record ID",
    "Acme Corp,acme@example.com,acme.com,Had a call,Call,2024-01-15,REC001",
    "Beta Inc,beta@example.com,beta.io,Sent proposal,Email,2024-01-16,REC002",
  ].join("\n");

  it("calls mapCsvFields with correct headers and target fields", async () => {
    setupCrm();
    vol.mkdirSync("/imports", { recursive: true });
    vol.writeFileSync("/imports/test.csv", SAMPLE_CSV);

    const runImport = await getRunImport();
    await runImport("/imports/test.csv", { from: "csv" }, DATA_DIR);

    expect(mockMapCsvFields).toHaveBeenCalledOnce();
    const [headers, fields] = mockMapCsvFields.mock.calls[0] as [string[], string[]];
    expect(headers).toContain("Company");
    expect(headers).toContain("Email");
    expect(fields).toContain("name");
    expect(fields).toContain("email");
    expect(fields).toContain("notes");
    expect(fields).toContain("date");
    expect(fields).toContain("activityType");
    expect(fields).toContain("sourceId");
  });

  it("calls mapCsvFields exactly once per import, not per row", async () => {
    setupCrm();
    vol.mkdirSync("/imports", { recursive: true });
    vol.writeFileSync("/imports/test.csv", SAMPLE_CSV);

    const runImport = await getRunImport();
    await runImport("/imports/test.csv", { from: "csv" }, DATA_DIR);

    // 2 rows in CSV, but mapCsvFields called only once
    expect(mockMapCsvFields).toHaveBeenCalledOnce();
  });

  it("creates customers using LLM-mapped name column", async () => {
    setupCrm();
    vol.mkdirSync("/imports", { recursive: true });
    vol.writeFileSync("/imports/test.csv", SAMPLE_CSV);

    const runImport = await getRunImport();
    const result = await runImport("/imports/test.csv", { from: "csv" }, DATA_DIR);

    expect(result.customersCreated).toBe(2);
    expect(vol.existsSync(`${DATA_DIR}/customers/acme-corp/main_facts.md`)).toBe(true);
    expect(vol.existsSync(`${DATA_DIR}/customers/beta-inc/main_facts.md`)).toBe(true);
  });

  it("gracefully handles null fields from LLM mapping", async () => {
    // LLM maps only name, everything else null
    mockMapCsvFields.mockResolvedValue({
      name: "Company",
      email: null,
      domain: null,
      notes: null,
      date: null,
      activityType: null,
      sourceId: null,
    });

    setupCrm();
    vol.mkdirSync("/imports", { recursive: true });
    const minimalCsv = ["Company,Email", "Acme Corp,acme@example.com"].join("\n");
    vol.writeFileSync("/imports/minimal.csv", minimalCsv);

    const runImport = await getRunImport();
    const result = await runImport("/imports/minimal.csv", { from: "csv" }, DATA_DIR);

    expect(result.errors).toHaveLength(0);
    expect(result.customersCreated).toBe(1);
  });

  it("dry-run calls mapCsvFields but creates no files", async () => {
    setupCrm();
    vol.mkdirSync("/imports", { recursive: true });
    vol.writeFileSync("/imports/test.csv", SAMPLE_CSV);

    const runImport = await getRunImport();
    const result = await runImport("/imports/test.csv", { from: "csv", dryRun: true }, DATA_DIR);

    // LLM still called to show the field mapping preview
    expect(mockMapCsvFields).toHaveBeenCalledOnce();
    // No customers created
    expect(result.customersCreated).toBe(0);
    expect(vol.existsSync(`${DATA_DIR}/customers/acme-corp`)).toBe(false);
  });

  it("uses sourceId from LLM mapping for deduplication ref", async () => {
    setupCrm();
    vol.mkdirSync("/imports", { recursive: true });
    vol.writeFileSync("/imports/test.csv", SAMPLE_CSV);

    const runImport = await getRunImport();
    await runImport("/imports/test.csv", { from: "hubspot" }, DATA_DIR);

    // Check interactions file for hubspot://activity/REC001 sourceRef
    const interactionsPath = `${DATA_DIR}/customers/acme-corp/interactions.md`;
    const interactions = vol.readFileSync(interactionsPath, "utf-8") as string;
    expect(interactions).toContain("hubspot://activity/REC001");
  });
});

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
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

vi.mock("../../src/fs/customer-dir.js", () => ({
  ensureCustomerDir: vi.fn().mockResolvedValue(undefined),
  customerExists: vi.fn().mockReturnValue(false),
  writeMainFacts: vi.fn().mockResolvedValue(undefined),
  readMainFacts: vi.fn().mockResolvedValue(null),
  getCustomerDir: vi.fn().mockReturnValue("/crm/customers/acme-corp"),
}));

vi.mock("../../src/fs/pipeline-writer.js", () => ({
  upsertDeal: vi.fn().mockResolvedValue(undefined),
  readPipeline: vi.fn().mockResolvedValue([]),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PERSONS = [
  {
    id: 1,
    name: "Alice Smith",
    primary_email: "alice@acme.com",
    org_name: "Acme Corp",
    org_id: { value: 10 },
  },
];

const ACTIVITIES = [
  {
    id: 101,
    type: "call",
    subject: "Demo call",
    note: "Went well",
    due_date: "2026-05-01",
    person_id: 1,
    org_id: 10,
  },
];

const PERSONS_RESP = {
  data: PERSONS,
  additional_data: { pagination: { more_items_in_collection: false } },
};

const ACTIVITIES_RESP = {
  data: ACTIVITIES,
  additional_data: { pagination: { more_items_in_collection: false } },
};

describe("runPipedriveApiImport", () => {
  it("imports persons as customers and activities as interactions", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(PERSONS_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(ACTIVITIES_RESP) });

    const { writeMainFacts } = await import("../../src/fs/customer-dir.js");
    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { runPipedriveApiImport } = await import("../../src/commands/import.js");

    const result = await runPipedriveApiImport({
      url: "https://myco.pipedrive.com",
      token: "tok_test",
      dataDir: "/crm",
    });

    expect(result.customersCreated).toBe(1);
    expect(result.interactionsImported).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(vi.mocked(appendInteraction)).toHaveBeenCalledOnce();
  });

  it("uses pipedrive://activity/<id> sourceRef format", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(PERSONS_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(ACTIVITIES_RESP) });

    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { runPipedriveApiImport } = await import("../../src/commands/import.js");

    await runPipedriveApiImport({
      url: "https://myco.pipedrive.com",
      token: "tok_test",
      dataDir: "/crm",
    });

    const call = vi.mocked(appendInteraction).mock.calls[0];
    const entry = call![2] as { sourceRef: string };
    expect(entry.sourceRef).toBe("pipedrive://activity/101");
  });

  it("skips already-imported activities", async () => {
    const { readInteractions } = await import("../../src/fs/interactions-writer.js");
    vi.mocked(readInteractions).mockResolvedValue("pipedrive://activity/101");

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(PERSONS_RESP) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(ACTIVITIES_RESP) });

    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { runPipedriveApiImport } = await import("../../src/commands/import.js");

    const result = await runPipedriveApiImport({
      url: "https://myco.pipedrive.com",
      token: "tok_test",
      dataDir: "/crm",
    });

    expect(result.interactionsImported).toBe(0);
    expect(vi.mocked(appendInteraction)).not.toHaveBeenCalled();
  });

  it("handles API error gracefully", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" });

    const { runPipedriveApiImport } = await import("../../src/commands/import.js");

    const result = await runPipedriveApiImport({
      url: "https://myco.pipedrive.com",
      token: "bad",
      dataDir: "/crm",
    });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/401|Unauthorized/);
  });
});

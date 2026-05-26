import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/fs/interactions-writer.js", () => ({
  appendInteraction: vi.fn().mockResolvedValue(undefined),
  readInteractions: vi.fn().mockResolvedValue(""),
}));

vi.mock("../../src/core/llm.js", () => ({
  summarizeEmail: vi.fn().mockResolvedValue({
    summary: "LLM summary",
    sentiment: "neutral",
    nextSteps: [],
  }),
}));

vi.mock("../../src/fs/sync-state.js", () => ({
  updateSlugSyncState: vi.fn(),
  getLastGmailSync: vi.fn().mockReturnValue(undefined),
}));

const GRAPH_RESPONSE = {
  value: [
    {
      id: "msg-001",
      subject: "Q3 renewal",
      bodyPreview: "Hi, following up on the renewal...",
      receivedDateTime: "2026-05-01T10:00:00Z",
      from: { emailAddress: { name: "Alice", address: "alice@acme.com" } },
    },
    {
      id: "msg-002",
      subject: "Invoice",
      bodyPreview: "Please find attached...",
      receivedDateTime: "2026-05-02T11:00:00Z",
      from: { emailAddress: { address: "billing@acme.com" } },
    },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(GRAPH_RESPONSE),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("syncMicrosoft", () => {
  it("fetches from Graph API and creates interactions", async () => {
    vol.fromJSON({ "/crm/customers/acme-corp/interactions.md": "# Interactions\n\n" });
    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncMicrosoft } = await import("../../src/sync/microsoft-sync.js");

    const result = await syncMicrosoft({
      slug: "acme-corp",
      dataDir: "/crm",
      accessToken: "tok_test",
    });

    expect(result.synced).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(vi.mocked(appendInteraction)).toHaveBeenCalledTimes(2);
  });

  it("uses microsoft://message/<id> sourceRef format", async () => {
    vol.fromJSON({ "/crm/customers/acme-corp/interactions.md": "# Interactions\n\n" });
    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncMicrosoft } = await import("../../src/sync/microsoft-sync.js");

    await syncMicrosoft({ slug: "acme-corp", dataDir: "/crm", accessToken: "tok_test" });

    const firstCall = vi.mocked(appendInteraction).mock.calls[0];
    const entry = firstCall![2] as { sourceRef: string };
    expect(entry.sourceRef).toBe("microsoft://message/msg-001");
  });

  it("skips already-imported messages", async () => {
    const { readInteractions } = await import("../../src/fs/interactions-writer.js");
    vi.mocked(readInteractions).mockResolvedValue("microsoft://message/msg-001\nmicrosoft://message/msg-002");
    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncMicrosoft } = await import("../../src/sync/microsoft-sync.js");

    const result = await syncMicrosoft({ slug: "acme-corp", dataDir: "/crm", accessToken: "tok_test" });

    expect(result.skipped).toBe(2);
    expect(result.synced).toBe(0);
    expect(vi.mocked(appendInteraction)).not.toHaveBeenCalled();
  });

  it("handles Graph API error gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" }));
    const { syncMicrosoft } = await import("../../src/sync/microsoft-sync.js");

    const result = await syncMicrosoft({ slug: "acme-corp", dataDir: "/crm", accessToken: "bad_token" });

    expect(result.synced).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/401|Unauthorized/);
  });

  it("handles network error gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const { syncMicrosoft } = await import("../../src/sync/microsoft-sync.js");

    const result = await syncMicrosoft({ slug: "acme-corp", dataDir: "/crm", accessToken: "tok_test" });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/ECONNREFUSED/);
  });

  it("reports synced count greater than zero after successful sync", async () => {
    vol.fromJSON({ "/crm/customers/acme-corp/interactions.md": "# Interactions\n\n" });
    const { readInteractions, appendInteraction } = await import("../../src/fs/interactions-writer.js");
    vi.mocked(readInteractions).mockResolvedValue("");
    vi.mocked(appendInteraction).mockResolvedValue(undefined);
    const { syncMicrosoft } = await import("../../src/sync/microsoft-sync.js");

    const result = await syncMicrosoft({ slug: "acme-corp", dataDir: "/crm", accessToken: "tok_test" });

    expect(result.synced).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });
});

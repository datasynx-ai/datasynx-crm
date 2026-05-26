import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/core/lancedb.js", () => ({
  indexInLanceDB: vi.fn().mockResolvedValue(undefined),
  searchKnowledge: vi.fn().mockResolvedValue([]),
  resetConnection: vi.fn(),
}));

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
});

describe("syncGmail", () => {
  function makeAuth() {
    return {} as import("googleapis").Auth.OAuth2Client;
  }

  it("syncs new emails and returns synced count", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
    });

    const { google } = await import("googleapis");
    const listMock = vi.fn().mockResolvedValue({
      data: { messages: [{ id: "msg1", threadId: "t1" }] },
    });
    const getMock = vi.fn().mockResolvedValue({
      data: {
        payload: {
          headers: [
            { name: "Subject", value: "Test Subject" },
            { name: "From", value: "sender@example.com" },
            { name: "Date", value: "Mon, 26 May 2026 10:00:00 +0000" },
          ],
        },
        snippet: "Email snippet",
      },
    });
    vi.mocked(google.gmail).mockReturnValue({
      users: { messages: { list: listMock, get: getMock } },
    } as never);

    const { syncGmail } = await import("../../src/sync/gmail-sync.js");
    const result = await syncGmail({
      slug: "acme-corp",
      dataDir: "/data",
      auth: makeAuth(),
      query: "from:example.com",
    });

    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("skips emails already in interactions (idempotency)", async () => {
    const source = "gmail://thread/t1";
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md":
        `# Interactions\n\nsourceRef: ${source}\n`,
    });

    const { google } = await import("googleapis");
    const listMock = vi.fn().mockResolvedValue({
      data: { messages: [{ id: "msg1", threadId: "t1" }] },
    });
    const getMock = vi.fn().mockResolvedValue({
      data: { payload: { headers: [] }, snippet: "" },
    });
    vi.mocked(google.gmail).mockReturnValue({
      users: { messages: { list: listMock, get: getMock } },
    } as never);

    const { syncGmail } = await import("../../src/sync/gmail-sync.js");
    const result = await syncGmail({
      slug: "acme-corp",
      dataDir: "/data",
      auth: makeAuth(),
      query: "from:example.com",
    });

    expect(result.skipped).toBe(1);
    expect(result.synced).toBe(0);
  });

  it("returns zero counts when no messages found", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
    });

    const { google } = await import("googleapis");
    vi.mocked(google.gmail).mockReturnValue({
      users: {
        messages: {
          list: vi.fn().mockResolvedValue({ data: { messages: [] } }),
          get: vi.fn(),
        },
      },
    } as never);

    const { syncGmail } = await import("../../src/sync/gmail-sync.js");
    const result = await syncGmail({
      slug: "acme-corp",
      dataDir: "/data",
      auth: makeAuth(),
      query: "from:example.com",
    });

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("appends after: filter when since is provided", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
    });

    const { google } = await import("googleapis");
    const listMock = vi.fn().mockResolvedValue({ data: { messages: [] } });
    vi.mocked(google.gmail).mockReturnValue({
      users: { messages: { list: listMock, get: vi.fn() } },
    } as never);

    const { syncGmail } = await import("../../src/sync/gmail-sync.js");
    const since = new Date("2026-05-01T00:00:00Z");
    await syncGmail({
      slug: "acme-corp",
      dataDir: "/data",
      auth: makeAuth(),
      query: "from:example.com",
      since,
    });

    const callArgs = listMock.mock.calls[0]?.[0] as { q: string } | undefined;
    expect(callArgs?.q).toContain("after:");
  });
});

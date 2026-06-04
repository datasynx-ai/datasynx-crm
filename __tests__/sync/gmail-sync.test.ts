import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/core/lancedb.js", () => ({
  indexInLanceDB: vi.fn().mockResolvedValue(undefined),
  searchKnowledge: vi.fn().mockResolvedValue([]),
  resetConnection: vi.fn(),
}));

const mockNotifyAgentWake = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../src/core/agent-notifier.js", () => ({
  notifyAgentWake: mockNotifyAgentWake,
}));

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
});

describe("syncGmail", () => {
  function makeAuth() {
    return {} as import("google-auth-library").OAuth2Client;
  }

  it("syncs new emails and returns synced count", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
    });

    const { gmail } = await import("@googleapis/gmail");
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
    vi.mocked(gmail).mockReturnValue({
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
      "/data/customers/acme-corp/interactions.md": `# Interactions\n\nsourceRef: ${source}\n`,
    });

    const { gmail } = await import("@googleapis/gmail");
    const listMock = vi.fn().mockResolvedValue({
      data: { messages: [{ id: "msg1", threadId: "t1" }] },
    });
    const getMock = vi.fn().mockResolvedValue({
      data: { payload: { headers: [] }, snippet: "" },
    });
    vi.mocked(gmail).mockReturnValue({
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

    const { gmail } = await import("@googleapis/gmail");
    vi.mocked(gmail).mockReturnValue({
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

    const { gmail } = await import("@googleapis/gmail");
    const listMock = vi.fn().mockResolvedValue({ data: { messages: [] } });
    vi.mocked(gmail).mockReturnValue({
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

  it("follows nextPageToken to fetch subsequent pages", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
    });

    const { gmail } = await import("@googleapis/gmail");
    const listMock = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          messages: [{ id: "msg1", threadId: "t1" }],
          nextPageToken: "page2token",
        },
      })
      .mockResolvedValueOnce({
        data: { messages: [{ id: "msg2", threadId: "t2" }] },
      });
    const getMock = vi.fn().mockResolvedValue({
      data: {
        payload: {
          headers: [
            { name: "Subject", value: "Test" },
            { name: "From", value: "a@b.com" },
            { name: "Date", value: "Mon, 26 May 2026 10:00:00 +0000" },
          ],
        },
        snippet: "snippet",
      },
    });
    vi.mocked(gmail).mockReturnValue({
      users: { messages: { list: listMock, get: getMock } },
    } as never);

    const { syncGmail } = await import("../../src/sync/gmail-sync.js");
    const result = await syncGmail({
      slug: "acme-corp",
      dataDir: "/data",
      auth: makeAuth(),
      query: "from:example.com",
    });

    // Both pages fetched → 2 synced messages
    expect(listMock).toHaveBeenCalledTimes(2);
    const secondCall = listMock.mock.calls[1]?.[0] as { pageToken?: string } | undefined;
    expect(secondCall?.pageToken).toBe("page2token");
    expect(result.synced).toBe(2);
  });

  it("stops paginating at maxPages limit", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
    });

    const { gmail } = await import("@googleapis/gmail");
    // Always return a nextPageToken — should stop at maxPages (default 5)
    const listMock = vi.fn().mockResolvedValue({
      data: {
        messages: [{ id: "msgX", threadId: "tX" }],
        nextPageToken: "alwaysMore",
      },
    });
    // Give each "msgX" a unique id so dedup doesn't short-circuit
    let callCount = 0;
    const listMockDynamic = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        data: {
          messages: [{ id: `msg${callCount}`, threadId: `t${callCount}` }],
          nextPageToken: "alwaysMore",
        },
      });
    });
    const getMock = vi.fn().mockResolvedValue({
      data: {
        payload: {
          headers: [
            { name: "Subject", value: "S" },
            { name: "From", value: "f@f.com" },
            { name: "Date", value: "Mon, 26 May 2026 10:00:00 +0000" },
          ],
        },
        snippet: "",
      },
    });
    vi.mocked(gmail).mockReturnValue({
      users: { messages: { list: listMockDynamic, get: getMock } },
    } as never);

    const { syncGmail } = await import("../../src/sync/gmail-sync.js");
    await syncGmail({
      slug: "acme-corp",
      dataDir: "/data",
      auth: makeAuth(),
      query: "from:example.com",
    });

    // Default maxPages = 5, so list should be called exactly 5 times
    expect(listMockDynamic).toHaveBeenCalledTimes(5);
  });

  it("retries messages.get on 429 with backoff and succeeds", async () => {
    vi.useFakeTimers();
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
    });

    const { gmail } = await import("@googleapis/gmail");
    const listMock = vi.fn().mockResolvedValue({
      data: { messages: [{ id: "msg1", threadId: "t1" }] },
    });
    const rateLimitError = Object.assign(new Error("Rate limit exceeded"), { status: 429 });
    const getMock = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({
        data: {
          payload: {
            headers: [
              { name: "Subject", value: "Test" },
              { name: "From", value: "a@b.com" },
              { name: "Date", value: "Mon, 26 May 2026 10:00:00 +0000" },
            ],
          },
          snippet: "snippet",
        },
      });
    vi.mocked(gmail).mockReturnValue({
      users: { messages: { list: listMock, get: getMock } },
    } as never);

    const { syncGmail } = await import("../../src/sync/gmail-sync.js");
    const syncPromise = syncGmail({
      slug: "acme-corp",
      dataDir: "/data",
      auth: makeAuth(),
      query: "from:example.com",
    });
    await vi.runAllTimersAsync();
    const result = await syncPromise;

    // Should retry and eventually succeed
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);

    vi.useRealTimers();
  });

  it("skips message after exhausting all retries and increments skipped", async () => {
    vi.useFakeTimers();
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
    });

    const { gmail } = await import("@googleapis/gmail");
    const listMock = vi.fn().mockResolvedValue({
      data: { messages: [{ id: "msg1", threadId: "t1" }] },
    });
    const rateLimitError = Object.assign(new Error("Rate limit exceeded"), { status: 429 });
    // Fail all 4 attempts (initial + 3 retries)
    const getMock = vi.fn().mockRejectedValue(rateLimitError);
    vi.mocked(gmail).mockReturnValue({
      users: { messages: { list: listMock, get: getMock } },
    } as never);

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const { syncGmail } = await import("../../src/sync/gmail-sync.js");
    const syncPromise = syncGmail({
      slug: "acme-corp",
      dataDir: "/data",
      auth: makeAuth(),
      query: "from:example.com",
    });
    await vi.runAllTimersAsync();
    const result = await syncPromise;

    // Should not crash; message is skipped
    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(1);
    // Should log to stderr
    expect(stderrSpy).toHaveBeenCalled();
    stderrSpy.mockRestore();

    vi.useRealTimers();
  });

  it("retries non-429 errors (all HTTP errors trigger backoff)", async () => {
    vi.useFakeTimers();
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
    });

    const { gmail } = await import("@googleapis/gmail");
    const listMock = vi.fn().mockResolvedValue({
      data: { messages: [{ id: "msg1", threadId: "t1" }] },
    });
    const serverError = Object.assign(new Error("Internal Server Error"), { status: 500 });
    const getMock = vi
      .fn()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce({
        data: {
          payload: {
            headers: [
              { name: "Subject", value: "Test" },
              { name: "From", value: "a@b.com" },
              { name: "Date", value: "Mon, 26 May 2026 10:00:00 +0000" },
            ],
          },
          snippet: "snippet",
        },
      });
    vi.mocked(gmail).mockReturnValue({
      users: { messages: { list: listMock, get: getMock } },
    } as never);

    const { syncGmail } = await import("../../src/sync/gmail-sync.js");
    const syncPromise = syncGmail({
      slug: "acme-corp",
      dataDir: "/data",
      auth: makeAuth(),
      query: "from:example.com",
    });
    await vi.runAllTimersAsync();
    const result = await syncPromise;

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(result.synced).toBe(1);

    vi.useRealTimers();
  });

  it("calls notifyAgentWake for new inbound email when agent config exists", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
      "/data/.agentic/agents/acme-corp.agent.json": JSON.stringify({
        slug: "acme-corp",
        channel: "telegram",
        wakeOn: ["email"],
        createdAt: "2026-01-01T00:00:00.000Z",
        lastWake: null,
        telegramChatId: "999888",
      }),
    });

    const { gmail } = await import("@googleapis/gmail");
    const listMock = vi.fn().mockResolvedValue({
      data: { messages: [{ id: "msg1", threadId: "t1" }] },
    });
    const getMock = vi.fn().mockResolvedValue({
      data: {
        payload: {
          headers: [
            { name: "Subject", value: "New inquiry" },
            { name: "From", value: "alice@acme.com" },
            { name: "Date", value: "Mon, 26 May 2026 10:00:00 +0000" },
          ],
        },
        snippet: "Hi, interested in your product",
      },
    });
    vi.mocked(gmail).mockReturnValue({
      users: { messages: { list: listMock, get: getMock } },
    } as never);

    const { syncGmail } = await import("../../src/sync/gmail-sync.js");
    await syncGmail({
      slug: "acme-corp",
      dataDir: "/data",
      auth: makeAuth(),
      query: "from:acme.com",
    });

    expect(mockNotifyAgentWake).toHaveBeenCalledOnce();
    const callArgs = mockNotifyAgentWake.mock.calls[0] as [string, string, object];
    expect(callArgs[0]).toBe("/data");
    expect(callArgs[1]).toBe("acme-corp");
    expect(callArgs[2]).toMatchObject({
      trigger: "email",
      subject: "New inquiry",
      from: "alice@acme.com",
    });
  });

  it("does not call notifyAgentWake when no agent config exists", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
      // No .agentic/agents/acme-corp.agent.json
    });

    const { gmail } = await import("@googleapis/gmail");
    const listMock = vi.fn().mockResolvedValue({
      data: { messages: [{ id: "msg1", threadId: "t1" }] },
    });
    const getMock = vi.fn().mockResolvedValue({
      data: {
        payload: {
          headers: [
            { name: "Subject", value: "Test" },
            { name: "From", value: "b@example.com" },
            { name: "Date", value: "Mon, 26 May 2026 10:00:00 +0000" },
          ],
        },
        snippet: "snippet",
      },
    });
    vi.mocked(gmail).mockReturnValue({
      users: { messages: { list: listMock, get: getMock } },
    } as never);

    const { syncGmail } = await import("../../src/sync/gmail-sync.js");
    await syncGmail({
      slug: "acme-corp",
      dataDir: "/data",
      auth: makeAuth(),
      query: "from:example.com",
    });

    expect(mockNotifyAgentWake).not.toHaveBeenCalled();
  });

  it("extracts and indexes the full email body, not just the snippet", async () => {
    vol.fromJSON({ "/data/customers/acme-corp/interactions.md": "# Interactions\n" });

    const { indexInLanceDB } = await import("../../src/core/lancedb.js");
    const bodyText = "Full message body with renewal details and pricing.";

    const { gmail } = await import("@googleapis/gmail");
    const listMock = vi.fn().mockResolvedValue({
      data: { messages: [{ id: "msgB", threadId: "tB" }] },
    });
    const getMock = vi.fn().mockResolvedValue({
      data: {
        payload: {
          mimeType: "multipart/alternative",
          headers: [
            { name: "Subject", value: "Renewal" },
            { name: "From", value: "client@example.com" },
            { name: "Date", value: "Mon, 01 Jun 2026 10:00:00 +0000" },
          ],
          parts: [
            { mimeType: "text/plain", body: { data: Buffer.from(bodyText).toString("base64url") } },
          ],
        },
        snippet: "Full message",
      },
    });
    vi.mocked(gmail).mockReturnValue({
      users: { messages: { list: listMock, get: getMock, attachments: { get: vi.fn() } } },
    } as never);

    const { syncGmail } = await import("../../src/sync/gmail-sync.js");
    await syncGmail({
      slug: "acme-corp",
      dataDir: "/data",
      auth: makeAuth(),
      query: "from:example.com",
    });

    const indexedTexts = vi.mocked(indexInLanceDB).mock.calls.map((c) => c[2]);
    expect(indexedTexts.some((t) => t.includes("renewal details and pricing"))).toBe(true);
  });

  it("downloads attachments, writes Markdown, and links them in the interaction", async () => {
    vol.fromJSON({ "/data/customers/acme-corp/interactions.md": "# Interactions\n" });

    const csv = "item,qty\nWidget,3";
    const attData = Buffer.from(csv).toString("base64url");

    const { gmail } = await import("@googleapis/gmail");
    const listMock = vi.fn().mockResolvedValue({
      data: { messages: [{ id: "msgA", threadId: "tA" }] },
    });
    const getMock = vi.fn().mockResolvedValue({
      data: {
        payload: {
          mimeType: "multipart/mixed",
          headers: [
            { name: "Subject", value: "Order" },
            { name: "From", value: "buyer@example.com" },
            { name: "Date", value: "Mon, 01 Jun 2026 10:00:00 +0000" },
          ],
          parts: [
            { mimeType: "text/plain", body: { size: 4 } },
            {
              filename: "order.csv",
              mimeType: "text/csv",
              body: { size: csv.length, attachmentId: "attA" },
            },
          ],
        },
        snippet: "an order",
      },
    });
    const attachGet = vi.fn().mockResolvedValue({ data: { data: attData } });
    vi.mocked(gmail).mockReturnValue({
      users: { messages: { list: listMock, get: getMock, attachments: { get: attachGet } } },
    } as never);

    const { syncGmail } = await import("../../src/sync/gmail-sync.js");
    const result = await syncGmail({
      slug: "acme-corp",
      dataDir: "/data",
      auth: makeAuth(),
      query: "from:example.com",
    });

    expect(result.synced).toBe(1);
    expect(attachGet).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "msgA", id: "attA" })
    );

    const json = vol.toJSON();
    expect(json["/data/customers/acme-corp/attachments/msgA__order.csv"]).toBe(csv);
    const md = json["/data/customers/acme-corp/attachments/msgA__order.csv.md"] as string;
    expect(md).toContain("| item | qty |");
    const interactions = json["/data/customers/acme-corp/interactions.md"] as string;
    expect(interactions).toContain("**Attachments:**");
    expect(interactions).toContain("(attachments/msgA__order.csv.md)");
  });
});

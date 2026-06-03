import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/core/lancedb.js", () => ({
  indexInLanceDB: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("decodeGmailPubSubPayload", () => {
  it("decodes base64 message data correctly", async () => {
    const { decodeGmailPubSubPayload } = await import("../../src/sync/gmail-webhook-handler.js");
    const inner = JSON.stringify({ emailAddress: "alice@example.com", historyId: "12345" });
    const encoded = Buffer.from(inner).toString("base64");
    const body = {
      message: { data: encoded, messageId: "m1", publishTime: "2026-05-28T06:00:00Z" },
      subscription: "projects/x/subscriptions/y",
    };
    const result = decodeGmailPubSubPayload(body);
    expect(result).not.toBeNull();
    expect(result!.emailAddress).toBe("alice@example.com");
    expect(result!.historyId).toBe("12345");
  });

  it("returns null for missing data field", async () => {
    const { decodeGmailPubSubPayload } = await import("../../src/sync/gmail-webhook-handler.js");
    const body = { message: { messageId: "m1" }, subscription: "projects/x/subscriptions/y" };
    expect(decodeGmailPubSubPayload(body)).toBeNull();
  });

  it("returns null when JSON is malformed", async () => {
    const { decodeGmailPubSubPayload } = await import("../../src/sync/gmail-webhook-handler.js");
    const encoded = Buffer.from("not-json").toString("base64");
    const body = { message: { data: encoded }, subscription: "y" };
    expect(decodeGmailPubSubPayload(body)).toBeNull();
  });

  it("extracts emailAddress and historyId from decoded payload", async () => {
    const { decodeGmailPubSubPayload } = await import("../../src/sync/gmail-webhook-handler.js");
    const inner = JSON.stringify({ emailAddress: "bob@company.com", historyId: "99999" });
    const encoded = Buffer.from(inner).toString("base64");
    const body = { message: { data: encoded } };
    const result = decodeGmailPubSubPayload(body);
    expect(result!.emailAddress).toBe("bob@company.com");
    expect(result!.historyId).toBe("99999");
  });
});

describe("verifyGmailPubSubSignature", () => {
  it("returns true for valid Authorization header with known token", async () => {
    const { verifyGmailPubSubSignature } = await import("../../src/sync/gmail-webhook-handler.js");
    expect(verifyGmailPubSubSignature("Bearer secret-token-123", "secret-token-123")).toBe(true);
  });

  it("returns false for missing Authorization header", async () => {
    const { verifyGmailPubSubSignature } = await import("../../src/sync/gmail-webhook-handler.js");
    expect(verifyGmailPubSubSignature(undefined, "secret-token-123")).toBe(false);
  });

  it("returns false for invalid token", async () => {
    const { verifyGmailPubSubSignature } = await import("../../src/sync/gmail-webhook-handler.js");
    expect(verifyGmailPubSubSignature("Bearer wrong-token", "secret-token-123")).toBe(false);
  });

  it("returns true when token is empty string (no auth configured)", async () => {
    const { verifyGmailPubSubSignature } = await import("../../src/sync/gmail-webhook-handler.js");
    expect(verifyGmailPubSubSignature("Bearer ", "")).toBe(true);
  });
});

describe("handleGmailPushEvent", () => {
  function makeSubscription(overrides: Record<string, unknown> = {}) {
    return {
      id: "psub_1_aaa",
      provider: "gmail" as const,
      slug: "acme-corp",
      webhookUrl: "https://example.com/webhooks/gmail",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      renewedAt: null,
      createdAt: new Date().toISOString(),
      providerData: { gmailEmailAddress: "alice@acme.com", gmailHistoryId: "10000" },
      status: "active" as const,
      lastEventAt: null,
      eventsProcessed: 0,
      ...overrides,
    };
  }

  it("calls fetchHistoryFn and appendInteractionFn when customer matched", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSubscription()],
        updatedAt: new Date().toISOString(),
      }),
      "/data/.agentic/sync-state.json": JSON.stringify({
        "acme-corp": { lastGmailPushHistoryId: "9999" },
      }),
    });

    const { handleGmailPushEvent } = await import("../../src/sync/gmail-webhook-handler.js");

    const fetchHistoryFn = vi.fn().mockResolvedValue([{ id: "msg1", threadId: "t1" }]);
    const fetchMessageFn = vi.fn().mockResolvedValue({
      id: "msg1",
      threadId: "t1",
      subject: "Test Email",
      from: "contact@acme.com",
      date: "Mon, 28 May 2026 10:00:00 +0000",
      body: "Hello",
    });
    const appendInteractionFn = vi.fn().mockResolvedValue(undefined);

    const result = await handleGmailPushEvent(
      "/data",
      { emailAddress: "alice@acme.com", historyId: "10001" },
      "psub_1_aaa",
      { fetchHistoryFn, fetchMessageFn, appendInteractionFn }
    );

    expect(result.slug).toBe("acme-corp");
    expect(result.processed).toBe(1);
    expect(fetchHistoryFn).toHaveBeenCalledWith(expect.any(String), "10000");
    expect(appendInteractionFn).toHaveBeenCalledOnce();
  });

  it("returns { processed: 0, slug: null } when email does not match any subscription", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSubscription()],
        updatedAt: new Date().toISOString(),
      }),
    });

    const { handleGmailPushEvent } = await import("../../src/sync/gmail-webhook-handler.js");
    const fetchHistoryFn = vi.fn();

    const result = await handleGmailPushEvent(
      "/data",
      { emailAddress: "unknown@other.com", historyId: "10001" },
      "psub_1_aaa",
      { fetchHistoryFn }
    );

    expect(result.slug).toBeNull();
    expect(result.processed).toBe(0);
    expect(fetchHistoryFn).not.toHaveBeenCalled();
  });

  it("updates lastGmailPushHistoryId in sync-state after processing", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSubscription()],
        updatedAt: new Date().toISOString(),
      }),
      "/data/.agentic/sync-state.json": JSON.stringify({}),
    });

    const { handleGmailPushEvent } = await import("../../src/sync/gmail-webhook-handler.js");

    const fetchHistoryFn = vi.fn().mockResolvedValue([{ id: "msg2", threadId: "t2" }]);
    const fetchMessageFn = vi.fn().mockResolvedValue({
      id: "msg2",
      threadId: "t2",
      subject: "S",
      from: "f@example.com",
      date: "Mon, 28 May 2026 10:00:00 +0000",
      body: "",
    });
    const appendInteractionFn = vi.fn().mockResolvedValue(undefined);

    await handleGmailPushEvent(
      "/data",
      { emailAddress: "alice@acme.com", historyId: "10002" },
      "psub_1_aaa",
      { fetchHistoryFn, fetchMessageFn, appendInteractionFn }
    );

    const raw = vol.readFileSync("/data/.agentic/sync-state.json", "utf-8") as string;
    const state = JSON.parse(raw) as Record<string, { lastGmailPushHistoryId?: string }>;
    expect(state["acme-corp"]?.lastGmailPushHistoryId).toBe("10002");
  });

  it("skips messages already seen (historyId <= lastProcessed)", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [
          makeSubscription({
            providerData: { gmailEmailAddress: "alice@acme.com", gmailHistoryId: "10005" },
          }),
        ],
        updatedAt: new Date().toISOString(),
      }),
      "/data/.agentic/sync-state.json": JSON.stringify({
        "acme-corp": { lastGmailPushHistoryId: "10005" },
      }),
    });

    const { handleGmailPushEvent } = await import("../../src/sync/gmail-webhook-handler.js");
    const fetchHistoryFn = vi.fn();

    const result = await handleGmailPushEvent(
      "/data",
      { emailAddress: "alice@acme.com", historyId: "10005" },
      "psub_1_aaa",
      { fetchHistoryFn }
    );

    expect(result.processed).toBe(0);
    expect(fetchHistoryFn).not.toHaveBeenCalled();
  });

  it("does not throw on empty history response", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSubscription()],
        updatedAt: new Date().toISOString(),
      }),
      "/data/.agentic/sync-state.json": JSON.stringify({}),
    });

    const { handleGmailPushEvent } = await import("../../src/sync/gmail-webhook-handler.js");
    const fetchHistoryFn = vi.fn().mockResolvedValue([]);
    const appendInteractionFn = vi.fn();

    const result = await handleGmailPushEvent(
      "/data",
      { emailAddress: "alice@acme.com", historyId: "10003" },
      "psub_1_aaa",
      { fetchHistoryFn, appendInteractionFn }
    );

    expect(result.processed).toBe(0);
    expect(appendInteractionFn).not.toHaveBeenCalled();
  });

  it("increments eventsProcessed counter on subscription", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSubscription()],
        updatedAt: new Date().toISOString(),
      }),
      "/data/.agentic/sync-state.json": JSON.stringify({}),
    });

    const { handleGmailPushEvent, readSubscriptions } =
      await import("../../src/sync/gmail-webhook-handler.js");
    const fetchHistoryFn = vi.fn().mockResolvedValue([{ id: "m3", threadId: "t3" }]);
    const fetchMessageFn = vi.fn().mockResolvedValue({
      id: "m3",
      threadId: "t3",
      subject: "S",
      from: "f@x.com",
      date: "Mon, 28 May 2026 10:00:00 +0000",
      body: "",
    });
    const appendInteractionFn = vi.fn().mockResolvedValue(undefined);

    await handleGmailPushEvent(
      "/data",
      { emailAddress: "alice@acme.com", historyId: "10004" },
      "psub_1_aaa",
      { fetchHistoryFn, fetchMessageFn, appendInteractionFn }
    );

    const subs = await readSubscriptions("/data");
    expect(subs[0]!.eventsProcessed).toBe(1);
    expect(subs[0]!.lastEventAt).not.toBeNull();
  });

  it("skips message and continues when fetchMessageFn throws", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSubscription()],
        updatedAt: new Date().toISOString(),
      }),
      "/data/.agentic/sync-state.json": JSON.stringify({}),
    });

    const { handleGmailPushEvent } = await import("../../src/sync/gmail-webhook-handler.js");
    const fetchHistoryFn = vi.fn().mockResolvedValue([
      { id: "bad-msg", threadId: "t-bad" },
      { id: "good-msg", threadId: "t-good" },
    ]);
    const fetchMessageFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValue({
        id: "good-msg",
        threadId: "t-good",
        subject: "Hi",
        from: "x@x.com",
        date: "Mon, 28 May 2026 10:00:00 +0000",
        body: "hello",
      });
    const appendInteractionFn = vi.fn().mockResolvedValue(undefined);

    const result = await handleGmailPushEvent(
      "/data",
      { emailAddress: "alice@acme.com", historyId: "20000" },
      "psub_1_aaa",
      { fetchHistoryFn, fetchMessageFn, appendInteractionFn }
    );
    // bad-msg skipped, good-msg processed
    expect(result.processed).toBe(1);
  });
});

describe("buildGmailRenewFn", () => {
  it("returns a RenewFn that returns expiresAt 7 days from now", async () => {
    const { buildGmailRenewFn } = await import("../../src/sync/gmail-webhook-handler.js");

    const mockRegister = vi.fn().mockResolvedValue({
      historyId: "99999",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const renewFn = buildGmailRenewFn("fake-token", "projects/x/topics/y", mockRegister);
    const sub = {
      id: "psub_1",
      provider: "gmail" as const,
      slug: "acme-corp",
      webhookUrl: "https://x.com/webhooks/gmail",
      expiresAt: new Date().toISOString(),
      renewedAt: null,
      createdAt: new Date().toISOString(),
      providerData: { gmailTopicName: "projects/x/topics/y" },
      status: "active" as const,
      lastEventAt: null,
      eventsProcessed: 0,
    };

    const result = await renewFn(sub);
    expect(result.expiresAt).toBeDefined();
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(result.providerData?.gmailHistoryId).toBe("99999");
    expect(mockRegister).toHaveBeenCalledWith("fake-token", "projects/x/topics/y");
  });

  it("renew result contains updated gmailHistoryId", async () => {
    const { buildGmailRenewFn } = await import("../../src/sync/gmail-webhook-handler.js");
    const mockRegister = vi.fn().mockResolvedValue({
      historyId: "77777",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const renewFn = buildGmailRenewFn("token-abc", "projects/p/topics/t", mockRegister);
    const sub = {
      id: "psub_2",
      provider: "gmail" as const,
      slug: "widget-co",
      webhookUrl: "https://x.com/webhooks/gmail",
      expiresAt: new Date().toISOString(),
      renewedAt: null,
      createdAt: new Date().toISOString(),
      providerData: { gmailTopicName: "projects/p/topics/t", gmailHistoryId: "60000" },
      status: "active" as const,
      lastEventAt: null,
      eventsProcessed: 0,
    };

    const result = await renewFn(sub);
    expect(result.providerData?.gmailHistoryId).toBe("77777");
  });

  it("uses default registerGmailWatch when no registerFn provided", async () => {
    vi.doMock("../../src/sync/gmail-push-watch.js", () => ({
      registerGmailWatch: vi.fn().mockResolvedValue({
        historyId: "88888",
        expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    }));

    const { buildGmailRenewFn } = await import("../../src/sync/gmail-webhook-handler.js");
    // No registerFn — exercises the default lambda (lines 166-169)
    const renewFn = buildGmailRenewFn("my-token", "projects/p/topics/q");
    const sub = {
      id: "psub_3",
      provider: "gmail" as const,
      slug: "co",
      webhookUrl: "https://x.com/webhooks/gmail",
      expiresAt: new Date().toISOString(),
      renewedAt: null,
      createdAt: new Date().toISOString(),
      providerData: { gmailTopicName: "projects/p/topics/q" },
      status: "active" as const,
      lastEventAt: null,
      eventsProcessed: 0,
    };
    const result = await renewFn(sub);
    expect(result.providerData?.gmailHistoryId).toBe("88888");
  });
});

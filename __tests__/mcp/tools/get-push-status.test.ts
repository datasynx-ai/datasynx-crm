import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: "psub_1_abc",
    provider: "gmail",
    slug: "acme-corp",
    webhookUrl: "https://example.com/webhooks/gmail",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    renewedAt: null,
    createdAt: new Date().toISOString(),
    providerData: {},
    status: "active",
    lastEventAt: null,
    eventsProcessed: 5,
    ...overrides,
  };
}

describe("handleGetPushStatus", () => {
  it("returns empty list when no subscriptions exist", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { handleGetPushStatus } = await import("../../../src/mcp/tools/get-push-status.js");
    const result = await handleGetPushStatus({}, "/data");
    const parsed = JSON.parse(result.content[0]!.text) as {
      subscriptions: unknown[];
      summary: Record<string, number>;
    };
    expect(parsed.subscriptions).toHaveLength(0);
    expect(parsed.summary.total).toBe(0);
    expect(parsed.summary.active).toBe(0);
  });

  it("returns all active subscriptions with computed fields", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [
          makeSub(),
          makeSub({ id: "psub_2_xyz", provider: "slack", slug: "widget-co", expiresAt: null }),
        ],
        updatedAt: new Date().toISOString(),
      }),
    });

    const { handleGetPushStatus } = await import("../../../src/mcp/tools/get-push-status.js");
    const result = await handleGetPushStatus({}, "/data");
    const parsed = JSON.parse(result.content[0]!.text) as {
      subscriptions: Array<{ id: string; expiresInHours: number | null; needsRenewal: boolean }>;
      summary: Record<string, number>;
    };
    expect(parsed.subscriptions).toHaveLength(2);
    expect(parsed.summary.total).toBe(2);
    expect(parsed.summary.active).toBe(2);
    // gmail sub should have expiresInHours set
    const gmailSub = parsed.subscriptions.find((s) => s.id === "psub_1_abc");
    expect(gmailSub?.expiresInHours).toBeGreaterThan(0);
    expect(gmailSub?.needsRenewal).toBe(false);
    // slack sub should have null expiresInHours
    const slackSub = parsed.subscriptions.find((s) => s.id === "psub_2_xyz");
    expect(slackSub?.expiresInHours).toBeNull();
  });

  it("filters by slug when provided", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSub(), makeSub({ id: "psub_2", slug: "widget-co" })],
        updatedAt: new Date().toISOString(),
      }),
    });

    const { handleGetPushStatus } = await import("../../../src/mcp/tools/get-push-status.js");
    const result = await handleGetPushStatus({ slug: "acme-corp" }, "/data");
    const parsed = JSON.parse(result.content[0]!.text) as {
      subscriptions: Array<{ slug: string }>;
    };
    expect(parsed.subscriptions).toHaveLength(1);
    expect(parsed.subscriptions[0]!.slug).toBe("acme-corp");
  });

  it("filters by provider when provided", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [
          makeSub(),
          makeSub({ id: "psub_slack", provider: "slack", expiresAt: null }),
        ],
        updatedAt: new Date().toISOString(),
      }),
    });

    const { handleGetPushStatus } = await import("../../../src/mcp/tools/get-push-status.js");
    const result = await handleGetPushStatus({ provider: "gmail" }, "/data");
    const parsed = JSON.parse(result.content[0]!.text) as {
      subscriptions: Array<{ provider: string }>;
    };
    expect(parsed.subscriptions).toHaveLength(1);
    expect(parsed.subscriptions[0]!.provider).toBe("gmail");
  });

  it("marks needsRenewal=true for subscriptions expiring within 24h", async () => {
    const soonExpiry = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(); // 10h
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSub({ expiresAt: soonExpiry })],
        updatedAt: new Date().toISOString(),
      }),
    });

    const { handleGetPushStatus } = await import("../../../src/mcp/tools/get-push-status.js");
    const result = await handleGetPushStatus({}, "/data");
    const parsed = JSON.parse(result.content[0]!.text) as {
      subscriptions: Array<{ needsRenewal: boolean }>;
      summary: { expiringSoon: number };
    };
    expect(parsed.subscriptions[0]!.needsRenewal).toBe(true);
    expect(parsed.summary.expiringSoon).toBe(1);
  });

  it("counts expired subscriptions in summary", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSub(), makeSub({ id: "psub_exp", status: "expired" })],
        updatedAt: new Date().toISOString(),
      }),
    });

    const { handleGetPushStatus } = await import("../../../src/mcp/tools/get-push-status.js");
    const result = await handleGetPushStatus({}, "/data");
    const parsed = JSON.parse(result.content[0]!.text) as { summary: Record<string, number> };
    expect(parsed.summary.expired).toBe(1);
    expect(parsed.summary.active).toBe(1);
  });

  it("registered handler invokes handleGetPushStatus with optional slug and provider", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSub()],
        updatedAt: new Date().toISOString(),
      }),
    });
    const cwd = process.cwd();
    vol.fromJSON({
      [`${cwd}/.agentic/push-subscriptions.json`]: JSON.stringify({
        subscriptions: [makeSub()],
        updatedAt: new Date().toISOString(),
      }),
    });
    const { registerGetPushStatus } = await import("../../../src/mcp/tools/get-push-status.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerGetPushStatus(fakeServer as never);
    const result = await capturedHandler!({ slug: "acme-corp", provider: "gmail" });
    const parsed = JSON.parse(result.content[0]!.text) as { subscriptions: unknown[] };
    expect(Array.isArray(parsed.subscriptions)).toBe(true);
  });

  it("returns error response when readSubscriptions throws", async () => {
    vi.doMock("../../../src/sync/push-manager.js", () => ({
      readSubscriptions: vi.fn().mockRejectedValue(new Error("push store error")),
    }));
    vol.fromJSON({});
    const { handleGetPushStatus } = await import("../../../src/mcp/tools/get-push-status.js");
    const result = await handleGetPushStatus({}, "/data");
    const parsed = JSON.parse(result.content[0]!.text) as { success?: boolean; error?: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("push store error");
  });
});

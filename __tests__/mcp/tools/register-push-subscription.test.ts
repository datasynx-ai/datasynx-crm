import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("handleRegisterPushSubscription", () => {
  it("creates a gmail subscription and returns subscriptionId", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { handleRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    const result = await handleRegisterPushSubscription(
      {
        provider: "gmail",
        slug: "acme-corp",
        webhookUrl: "https://example.com/webhooks/gmail",
        gmailTopicName: "projects/x/topics/y",
      },
      "/data"
    );
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed["subscriptionId"]).toMatch(/^psub_/);
    expect(parsed["provider"]).toBe("gmail");
    expect(parsed["slug"]).toBe("acme-corp");
    expect(parsed["status"]).toBe("active");
    expect(parsed["expiresAt"]).toBeDefined();
  });

  it("creates a microsoft-graph subscription", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { handleRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    const result = await handleRegisterPushSubscription(
      {
        provider: "microsoft-graph",
        slug: "widget-co",
        webhookUrl: "https://example.com/webhooks/ms",
        microsoftClientState: "secret-123",
      },
      "/data"
    );
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed["provider"]).toBe("microsoft-graph");
    expect(parsed["expiresAt"]).toBeDefined();
  });

  it("creates a slack subscription with null expiresAt", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { handleRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    const result = await handleRegisterPushSubscription(
      {
        provider: "slack",
        slug: "acme-corp",
        webhookUrl: "https://example.com/webhooks/slack",
        slackTeamId: "T12345",
      },
      "/data"
    );
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed["expiresAt"]).toBeNull();
  });

  it("persists subscription to push-subscriptions.json", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { handleRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    await handleRegisterPushSubscription(
      { provider: "gmail", slug: "acme-corp", webhookUrl: "https://example.com/webhooks/gmail" },
      "/data"
    );
    const raw = vol.readFileSync("/data/.agentic/push-subscriptions.json", "utf-8") as string;
    const parsed = JSON.parse(raw) as { subscriptions: unknown[] };
    expect(parsed.subscriptions).toHaveLength(1);
  });

  it("warns when webhookUrl contains localhost", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { handleRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    const result = await handleRegisterPushSubscription(
      { provider: "gmail", slug: "acme-corp", webhookUrl: "http://localhost:3847/webhooks/gmail" },
      "/data"
    );
    const parsed = JSON.parse(result.content[0]!.text) as { warning?: string };
    expect(parsed.warning).toContain("localhost");
  });

  it("returns error on invalid provider gracefully", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { handleRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    const result = await handleRegisterPushSubscription(
      {
        provider: "invalid-provider" as "gmail",
        slug: "acme-corp",
        webhookUrl: "https://example.com",
      },
      "/data"
    );
    const parsed = JSON.parse(result.content[0]!.text) as { success?: boolean };
    expect(parsed.success).toBe(false);
  });

  it("registers tool with correct name", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { registerRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    const calls: string[] = [];
    const fakeServer = { registerTool: (name: string) => calls.push(name) };
    registerRegisterPushSubscription(fakeServer as never);
    expect(calls).toContain("register_push_subscription");
  });

  it("includes optional microsoftResource in providerData", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { handleRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    const result = await handleRegisterPushSubscription(
      {
        provider: "microsoft-graph",
        slug: "acme-corp",
        webhookUrl: "https://example.com/webhooks/ms",
        microsoftClientState: "secret",
        microsoftResource: "/me/mailFolders/Inbox/messages",
      },
      "/data"
    );
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed["provider"]).toBe("microsoft-graph");
  });

  it("registered handler invokes handleRegisterPushSubscription with optional params", async () => {
    const cwd = process.cwd();
    vol.fromJSON({ [`${cwd}/.agentic/.keep`]: "" });
    const { registerRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerRegisterPushSubscription(fakeServer as never);
    const result = await capturedHandler!({
      provider: "gmail",
      slug: "acme-corp",
      webhookUrl: "https://example.com/webhooks/gmail",
      gmailTopicName: "projects/x/topics/y",
      microsoftClientState: "secret",
      microsoftResource: "/me/mail",
      slackTeamId: "T123",
      slackChannelId: "C456",
    });
    const parsed = JSON.parse(result.content[0]!.text) as { provider: string };
    expect(parsed.provider).toBe("gmail");
  });

  it("returns error response when register throws", async () => {
    vi.doMock("../../../src/sync/push-manager.js", () => ({
      register: vi.fn().mockRejectedValue(new Error("push registration failed")),
    }));
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { handleRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    const result = await handleRegisterPushSubscription(
      { provider: "gmail", slug: "acme-corp", webhookUrl: "https://example.com/webhook" },
      "/data"
    );
    const parsed = JSON.parse(result.content[0]!.text) as { success?: boolean; error?: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("push registration failed");
  });
});

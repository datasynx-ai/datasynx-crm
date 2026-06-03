import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("runPushRegister", () => {
  it("prints success message and subscriptionId after registration", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    vi.spyOn(process, "cwd").mockReturnValue("/data");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runPushRegister } = await import("../../src/commands/push.js");
    await runPushRegister("acme-corp", {
      provider: "gmail",
      webhookUrl: "https://example.com/webhooks/gmail",
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("psub_"));
    consoleSpy.mockRestore();
  });

  it("warns when webhookUrl contains localhost", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    vi.spyOn(process, "cwd").mockReturnValue("/data");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runPushRegister } = await import("../../src/commands/push.js");
    await runPushRegister("acme-corp", {
      provider: "slack",
      webhookUrl: "http://localhost:3847/webhooks/slack",
    });

    const allOutput = consoleSpy.mock.calls.flat().join(" ");
    expect(allOutput.toLowerCase()).toContain("localhost");
    consoleSpy.mockRestore();
  });
});

describe("runPushStatus", () => {
  it("prints 'no subscriptions' when empty", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runPushStatus } = await import("../../src/commands/push.js");
    await runPushStatus({});

    const output = consoleSpy.mock.calls.flat().join(" ");
    expect(output).toContain("No push subscriptions");
    consoleSpy.mockRestore();
  });

  it("lists active subscriptions", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [
          {
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
            eventsProcessed: 42,
          },
        ],
        updatedAt: new Date().toISOString(),
      }),
    });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runPushStatus } = await import("../../src/commands/push.js");
    await runPushStatus({});

    const output = consoleSpy.mock.calls.flat().join(" ");
    expect(output).toContain("acme-corp");
    expect(output).toContain("gmail");
    consoleSpy.mockRestore();
  });
});

describe("runPushRevoke", () => {
  it("prints error when subscription id not found", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    const { runPushRevoke } = await import("../../src/commands/push.js");
    await expect(runPushRevoke("psub_nonexistent")).rejects.toThrow("exit");

    expect(consoleErrSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
    consoleErrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("marks subscription as revoked", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [
          {
            id: "psub_revoke_me",
            provider: "gmail",
            slug: "acme-corp",
            webhookUrl: "https://example.com",
            expiresAt: null,
            renewedAt: null,
            createdAt: new Date().toISOString(),
            providerData: {},
            status: "active",
            lastEventAt: null,
            eventsProcessed: 0,
          },
        ],
        updatedAt: new Date().toISOString(),
      }),
    });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runPushRevoke } = await import("../../src/commands/push.js");
    await runPushRevoke("psub_revoke_me");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("revoked"));
    consoleSpy.mockRestore();
  });
});

describe("runPushStatus — filtering", () => {
  const baseSubs = [
    {
      id: "psub_1",
      provider: "gmail",
      slug: "acme-corp",
      webhookUrl: "https://example.com/1",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      renewedAt: null,
      createdAt: new Date().toISOString(),
      providerData: {},
      status: "active",
      lastEventAt: null,
      eventsProcessed: 5,
    },
    {
      id: "psub_2",
      provider: "slack",
      slug: "beta-ltd",
      webhookUrl: "https://example.com/2",
      expiresAt: null,
      renewedAt: null,
      createdAt: new Date().toISOString(),
      providerData: {},
      status: "active",
      lastEventAt: "2026-01-01T00:00:00Z",
      eventsProcessed: 10,
    },
  ];

  it("filters by slug", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: baseSubs,
        updatedAt: new Date().toISOString(),
      }),
    });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runPushStatus } = await import("../../src/commands/push.js");
    await runPushStatus({ slug: "acme-corp" });

    const output = consoleSpy.mock.calls.flat().join(" ");
    expect(output).toContain("acme-corp");
    expect(output).not.toContain("beta-ltd");
    consoleSpy.mockRestore();
  });

  it("filters by provider", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: baseSubs,
        updatedAt: new Date().toISOString(),
      }),
    });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runPushStatus } = await import("../../src/commands/push.js");
    await runPushStatus({ provider: "slack" });

    const output = consoleSpy.mock.calls.flat().join(" ");
    expect(output).toContain("beta-ltd");
    expect(output).not.toContain("acme-corp");
    consoleSpy.mockRestore();
  });

  it("shows RENEW SOON for subscription expiring within 24h", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [
          {
            ...baseSubs[0],
            expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2h
          },
        ],
        updatedAt: new Date().toISOString(),
      }),
    });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runPushStatus } = await import("../../src/commands/push.js");
    await runPushStatus({});

    const output = consoleSpy.mock.calls.flat().join(" ");
    expect(output).toContain("RENEW SOON");
    consoleSpy.mockRestore();
  });
});

describe("runPushRenew", () => {
  it("prints provider-specific guidance when --id given and subscription exists", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [
          {
            id: "psub_abc",
            provider: "gmail",
            slug: "acme",
            webhookUrl: "https://example.com",
            expiresAt: new Date(Date.now() + 1000).toISOString(),
            renewedAt: null,
            createdAt: new Date().toISOString(),
            providerData: {},
            status: "active",
            lastEventAt: null,
            eventsProcessed: 0,
          },
        ],
        updatedAt: new Date().toISOString(),
      }),
    });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runPushRenew } = await import("../../src/commands/push.js");
    await runPushRenew({ id: "psub_abc" });

    const output = consoleSpy.mock.calls.flat().join(" ");
    expect(output).toContain("psub_abc");
    consoleSpy.mockRestore();
  });

  it("exits with error when --id subscription not found", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    const { runPushRenew } = await import("../../src/commands/push.js");
    await expect(runPushRenew({ id: "nonexistent" })).rejects.toThrow("exit");

    expect(consoleErrSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
    consoleErrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("runs renewExpiringSubscriptions when no --id given", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runPushRenew } = await import("../../src/commands/push.js");
    await runPushRenew({});

    const output = consoleSpy.mock.calls.flat().join(" ");
    expect(output).toContain("Renewed:");
    consoleSpy.mockRestore();
  });
});

describe("pushCommand — parseAsync register and status", () => {
  it("push register calls runPushRegister via Commander action", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { pushCommand } = await import("../../src/commands/push.js");
    await pushCommand.parseAsync([
      "node",
      "push",
      "register",
      "acme",
      "--provider",
      "gmail",
      "--webhook-url",
      "https://example.com/webhooks/gmail",
    ]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("psub_"));
    consoleSpy.mockRestore();
  });

  it("push status calls runPushStatus via Commander action", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { pushCommand } = await import("../../src/commands/push.js");
    await pushCommand.parseAsync(["node", "push", "status"]);

    consoleSpy.mockRestore();
  });
});

describe("pushCommand — parseAsync action coverage", () => {
  it("push revoke <id> calls runPushRevoke via Commander action", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [
          {
            id: "psub_cmd_revoke",
            provider: "gmail",
            slug: "acme",
            webhookUrl: "https://example.com",
            expiresAt: null,
            renewedAt: null,
            createdAt: new Date().toISOString(),
            providerData: {},
            status: "active",
            lastEventAt: null,
            eventsProcessed: 0,
          },
        ],
        updatedAt: new Date().toISOString(),
      }),
    });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { pushCommand } = await import("../../src/commands/push.js");
    await pushCommand.parseAsync(["node", "push", "revoke", "psub_cmd_revoke"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("revoked"));
    consoleSpy.mockRestore();
  });

  it("push renew calls runPushRenew via Commander action", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { pushCommand } = await import("../../src/commands/push.js");
    await pushCommand.parseAsync(["node", "push", "renew"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Renewed:"));
    consoleSpy.mockRestore();
  });
});

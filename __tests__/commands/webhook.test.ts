import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  process.env["DXCRM_DATA_DIR"] = "/crm";
});
afterEach(() => {
  delete process.env["DXCRM_DATA_DIR"];
});

describe("dxcrm webhook", () => {
  it("adds and lists a subscription", async () => {
    vol.fromJSON({ "/crm/.keep": "" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { webhookCommand } = await import("../../src/commands/webhook.js");

    await webhookCommand.parseAsync([
      "node",
      "webhook",
      "add",
      "https://hooks.example.com/x",
      "--events",
      "record.created,deal.updated",
    ]);

    const stored = JSON.parse(
      vol.readFileSync("/crm/.agentic/webhooks.json", "utf-8") as string
    ) as { subscriptions: Array<{ url: string; events: string[] }> };
    expect(stored.subscriptions[0]!.url).toBe("https://hooks.example.com/x");
    expect(stored.subscriptions[0]!.events).toEqual(["record.created", "deal.updated"]);

    await webhookCommand.parseAsync(["node", "webhook", "list"]);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("hooks.example.com");
    logSpy.mockRestore();
  });
});

// E2E tests for D20 — Proactive Agent full workflow
// Covers: buildDailyBriefing → enqueueTask → drainProactiveQueue (D20 path)
import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

// Mock https for drainProactiveQueue (Telegram/Slack transport)
const mockHttpsRequest = vi.hoisted(() => vi.fn());
vi.mock("https", () => ({ default: { request: mockHttpsRequest } }));

function mockHttpOk() {
  const req = { on: vi.fn(), write: vi.fn(), end: vi.fn() };
  const res = { resume: vi.fn() };
  mockHttpsRequest.mockImplementation((...args: unknown[]) => {
    const cb = args.find((a) => typeof a === "function") as ((r: typeof res) => void) | undefined;
    if (cb) cb(res);
    return req;
  });
  return req;
}

const DATA_DIR = "/data";
const TODAY = "2026-05-28";

function seedCustomer(slug: string, extra: Record<string, string> = {}) {
  vol.fromJSON({
    [`${DATA_DIR}/customers/${slug}/main_facts.md`]: `name: ${slug}\ndomain: ${slug}.com\n`,
    [`${DATA_DIR}/customers/${slug}/interactions.md`]: "",
    ...extra,
  });
}

describe("Proactive workflow — buildDailyBriefing", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns briefing with required fields", async () => {
    vol.fromJSON({});
    const { buildDailyBriefing } = await import("../../src/core/proactive-agent.js");
    const briefing = await buildDailyBriefing(DATA_DIR, TODAY);

    expect(briefing.date).toBe(TODAY);
    expect(typeof briefing.generatedAt).toBe("string");
    expect(Array.isArray(briefing.urgent)).toBe(true);
    expect(Array.isArray(briefing.opportunities)).toBe(true);
    expect(typeof briefing.forecast).toBe("string");
    expect(typeof briefing.topAction).toBe("string");
  });

  it("returns 'No active pipeline' when no customers", async () => {
    vol.fromJSON({});
    const { buildDailyBriefing } = await import("../../src/core/proactive-agent.js");
    const briefing = await buildDailyBriefing(DATA_DIR, TODAY);

    expect(briefing.forecast).toContain("No active pipeline");
  });

  it("handles empty customer list without errors", async () => {
    vol.fromJSON({});
    const { buildDailyBriefing } = await import("../../src/core/proactive-agent.js");
    await expect(buildDailyBriefing(DATA_DIR, TODAY)).resolves.toBeDefined();
  });

  it("includes deal at risk in urgent when close date within 7 days", async () => {
    const closeDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    seedCustomer("acme", {
      [`${DATA_DIR}/customers/acme/pipeline.md`]: [
        "# Pipeline",
        "",
        "| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |",
        "|------|-------|-------|----------|-------------|------------|-------|---------|",
        `| Enterprise License | proposal | 50000 |  | 0.7 | ${closeDate} |  | ${TODAY} |`,
      ].join("\n"),
    });

    const { buildDailyBriefing } = await import("../../src/core/proactive-agent.js");
    const briefing = await buildDailyBriefing(DATA_DIR, TODAY);

    // At least one urgent entry about the deal
    expect(briefing.urgent.some((u) => u.toLowerCase().includes("acme") || u.toLowerCase().includes("enterprise"))).toBe(true);
  });
});

describe("Proactive workflow — enqueueTask + readQueue", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("enqueued task appears in readQueue", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/.keep`]: "" });
    const { enqueueTask, readQueue } = await import("../../src/core/proactive-agent.js");

    await enqueueTask(DATA_DIR, {
      type: "daily_briefing",
      priority: "normal",
      payload: { date: TODAY },
      scheduledFor: new Date().toISOString(),
      channel: "mcp_tool_response",
    });

    const queue = readQueue(DATA_DIR);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.type).toBe("daily_briefing");
    expect(queue[0]!.status).toBe("pending");
  });

  it("multiple tasks are all stored", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/.keep`]: "" });
    const { enqueueTask, readQueue } = await import("../../src/core/proactive-agent.js");

    await Promise.all([
      enqueueTask(DATA_DIR, { type: "daily_briefing", priority: "normal", payload: {}, scheduledFor: new Date().toISOString(), channel: "mcp_tool_response" }),
      enqueueTask(DATA_DIR, { type: "relationship_decay_alert", slug: "acme", priority: "urgent", payload: {}, scheduledFor: new Date().toISOString(), channel: "mcp_tool_response" }),
    ]);

    expect(readQueue(DATA_DIR)).toHaveLength(2);
  });
});

describe("Proactive workflow — drainProactiveQueue", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env["TELEGRAM_BOT_TOKEN"];
    delete process.env["SLACK_WEBHOOK_URL"];
  });

  it("marks mcp_tool_response tasks as done without sending HTTP", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/.keep`]: "" });
    const { enqueueTask, readQueue } = await import("../../src/core/proactive-agent.js");
    const { drainProactiveQueue } = await import("../../src/core/notification-dispatcher.js");

    await enqueueTask(DATA_DIR, {
      type: "daily_briefing",
      priority: "normal",
      payload: { date: TODAY },
      scheduledFor: new Date().toISOString(),
      channel: "mcp_tool_response",
    });

    const result = await drainProactiveQueue(DATA_DIR);

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockHttpsRequest).not.toHaveBeenCalled();

    const queue = readQueue(DATA_DIR);
    expect(queue[0]!.status).toBe("done");
  });

  it("sends to Telegram and marks done when token set", async () => {
    process.env["TELEGRAM_BOT_TOKEN"] = "tok123";
    process.env["TELEGRAM_CHAT_ID"] = "chat456";
    mockHttpOk();

    vol.fromJSON({ [`${DATA_DIR}/.agentic/.keep`]: "" });
    const { enqueueTask, readQueue } = await import("../../src/core/proactive-agent.js");
    const { drainProactiveQueue } = await import("../../src/core/notification-dispatcher.js");

    await enqueueTask(DATA_DIR, {
      type: "relationship_decay_alert",
      slug: "acme",
      priority: "urgent",
      payload: { name: "Alice", daysSinceContact: 35, grade: "F" },
      scheduledFor: new Date().toISOString(),
      channel: "telegram",
    });

    const result = await drainProactiveQueue(DATA_DIR);

    expect(result.sent).toBe(1);
    expect(mockHttpsRequest).toHaveBeenCalled();
    expect(readQueue(DATA_DIR)[0]!.status).toBe("done");

    delete process.env["TELEGRAM_BOT_TOKEN"];
    delete process.env["TELEGRAM_CHAT_ID"];
  });

  it("returns {sent:0, failed:0} when queue is empty", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/.keep`]: "" });
    const { drainProactiveQueue } = await import("../../src/core/notification-dispatcher.js");
    const result = await drainProactiveQueue(DATA_DIR);
    expect(result).toEqual({ sent: 0, failed: 0 });
  });

  it("skips already-done tasks", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/.keep`]: "" });
    const { enqueueTask, markTaskDone, readQueue } = await import("../../src/core/proactive-agent.js");
    const { drainProactiveQueue } = await import("../../src/core/notification-dispatcher.js");

    await enqueueTask(DATA_DIR, { type: "daily_briefing", priority: "normal", payload: {}, scheduledFor: new Date().toISOString(), channel: "mcp_tool_response" });
    const task = readQueue(DATA_DIR)[0]!;
    await markTaskDone(DATA_DIR, task.id);

    const result = await drainProactiveQueue(DATA_DIR);
    expect(result.sent).toBe(0); // already done, skipped
  });
});

describe("Proactive workflow — runDailyProactiveChecks integration", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env["TELEGRAM_BOT_TOKEN"];
  });

  it("enqueues daily_briefing task for empty data dir", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/.keep`]: "" });
    const { runDailyProactiveChecks } = await import("../../src/daemon/proactive-worker.js");
    const { readQueue } = await import("../../src/core/proactive-agent.js");

    const result = await runDailyProactiveChecks(DATA_DIR, TODAY);

    expect(result.tasksEnqueued).toBeGreaterThanOrEqual(1);
    const queue = readQueue(DATA_DIR);
    expect(queue.some((t) => t.type === "daily_briefing")).toBe(true);
  });

  it("enqueues relationship_decay_alert for customer with health.json showing grade F", async () => {
    const healthSnapshot = {
      schemaVersion: "1",
      slug: "acme",
      overallHealth: 10,
      updatedAt: new Date().toISOString(),
      contacts: [{
        contactId: "c1",
        name: "Alice",
        email: "alice@acme.com",
        score: 5,
        grade: "F",
        trend: "cold",
        daysSinceContact: 45,
        avgCadenceDays: 14,
        sentimentTrend: -2,
        riskFlags: ["NO_CONTACT_30D"],
        lastContact: "2026-04-01",
        interactionCount30d: 0,
        recommendation: "Re-engage immediately",
        updatedAt: new Date().toISOString(),
      }],
    };
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/.keep`]: "",
      [`${DATA_DIR}/customers/acme/health.json`]: JSON.stringify(healthSnapshot),
    });

    const { runDailyProactiveChecks } = await import("../../src/daemon/proactive-worker.js");
    const { readQueue } = await import("../../src/core/proactive-agent.js");

    await runDailyProactiveChecks(DATA_DIR, TODAY);

    const queue = readQueue(DATA_DIR);
    expect(queue.some((t) => t.type === "relationship_decay_alert")).toBe(true);
    const alert = queue.find((t) => t.type === "relationship_decay_alert")!;
    expect(alert.priority).toBe("urgent");
  });
});

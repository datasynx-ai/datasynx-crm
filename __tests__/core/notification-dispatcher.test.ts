import { describe, it, expect, beforeEach, vi, type MockedFunction } from "vitest";
import type { AgentTask } from "../../src/core/proactive-agent.js";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockReadQueue = vi.hoisted(() => vi.fn<[string], AgentTask[]>());
const mockMarkTaskDone = vi.hoisted(() => vi.fn<[string, string, string?], Promise<void>>());

vi.mock("../../src/core/proactive-agent.js", () => ({
  readQueue: mockReadQueue,
  markTaskDone: mockMarkTaskDone,
}));

// Mock https.request for sendTelegram / sendSlack tests
const mockHttpsRequest = vi.hoisted(() => vi.fn());
vi.mock("https", () => ({ default: { request: mockHttpsRequest } }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task_1",
    type: "daily_briefing",
    priority: "normal",
    payload: {},
    createdAt: new Date().toISOString(),
    scheduledFor: new Date().toISOString(),
    status: "pending",
    channel: "mcp_tool_response",
    ...overrides,
  };
}

/** Returns a minimal EventEmitter-like object that resolves the https.request mock.
 *  Works for both 2-arg form https.request(opts, cb) and 3-arg form https.request(url, opts, cb).
 */
function makeHttpsMockReq(statusCode = 200) {
  let errorCb: ((e: Error) => void) | undefined;
  const req = {
    on: vi.fn((event: string, cb: (e: Error) => void) => {
      if (event === "error") errorCb = cb;
    }),
    write: vi.fn(),
    end: vi.fn(),
    _triggerError: (e: Error) => errorCb?.(e),
  };
  const res = { resume: vi.fn(), statusCode };
  mockHttpsRequest.mockImplementation((...args: unknown[]) => {
    const cb = args.find((a) => typeof a === "function") as ((res: typeof res) => void) | undefined;
    if (cb) cb(res);
    return req;
  });
  return req;
}

const DATA_DIR = "/data";

// ─── formatTaskMessage ────────────────────────────────────────────────────────

describe("formatTaskMessage", () => {
  let formatTaskMessage: (task: AgentTask) => string;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../src/core/notification-dispatcher.js");
    formatTaskMessage = mod.formatTaskMessage;
  });

  it("formats daily_briefing with urgent items", () => {
    const task = makeTask({
      type: "daily_briefing",
      payload: {
        urgent: ["Deal A closing tomorrow", "Contact B went silent"],
        forecast: "Q forecast: P50 €120k",
        topAction: "Call Alice at Acme",
      },
    });
    const msg = formatTaskMessage(task);
    expect(msg).toContain("Daily CRM Briefing");
    expect(msg).toContain("Urgent:");
    expect(msg).toContain("Deal A closing tomorrow");
    expect(msg).toContain("Q forecast: P50 €120k");
    expect(msg).toContain("Call Alice at Acme");
  });

  it("formats daily_briefing without urgent items", () => {
    const task = makeTask({
      type: "daily_briefing",
      payload: { urgent: [], forecast: "No active pipeline.", topAction: "Review pipeline." },
    });
    const msg = formatTaskMessage(task);
    expect(msg).toContain("Daily CRM Briefing");
    expect(msg).not.toContain("Urgent:");
    expect(msg).toContain("No active pipeline.");
  });

  it("formats relationship_decay_alert with slug and grade", () => {
    const task = makeTask({
      type: "relationship_decay_alert",
      slug: "acme-corp",
      payload: { name: "Alice Smith", daysSinceContact: 35, grade: "F" },
    });
    const msg = formatTaskMessage(task);
    expect(msg).toContain("Relationship Alert: acme-corp");
    expect(msg).toContain("Alice Smith");
    expect(msg).toContain("35 days silent");
    expect(msg).toContain("grade F");
  });

  it("formats deal_risk_alert with slug and days", () => {
    const task = makeTask({
      type: "deal_risk_alert",
      slug: "beta-gmbh",
      payload: { dealName: "Enterprise License", daysToClose: 3 },
    });
    const msg = formatTaskMessage(task);
    expect(msg).toContain("Deal Risk: beta-gmbh");
    expect(msg).toContain("Enterprise License");
    expect(msg).toContain("3 days");
  });

  it("formats external_signal_alert", () => {
    const task = makeTask({
      type: "external_signal_alert",
      slug: "gamma-ag",
      payload: { summary: "Series B funding announced" },
    });
    const msg = formatTaskMessage(task);
    expect(msg).toContain("Signal: gamma-ag");
    expect(msg).toContain("Series B funding");
  });

  it("formats follow_up_nudge", () => {
    const task = makeTask({
      type: "follow_up_nudge",
      slug: "delta-inc",
      payload: { message: "Schedule Q3 review call" },
    });
    const msg = formatTaskMessage(task);
    expect(msg).toContain("Follow-up: delta-inc");
    expect(msg).toContain("Schedule Q3 review call");
  });

  it("formats unknown task type as fallback", () => {
    const task = makeTask({
      type: "pipeline_forecast_weekly",
      payload: { weeks: 4 },
    });
    const msg = formatTaskMessage(task);
    expect(msg).toContain("pipeline_forecast_weekly");
  });

  it("limits urgent list to 3 items", () => {
    const task = makeTask({
      type: "daily_briefing",
      payload: { urgent: ["A", "B", "C", "D", "E"], forecast: "", topAction: "" },
    });
    const msg = formatTaskMessage(task);
    expect(msg).toContain("• A");
    expect(msg).toContain("• C");
    expect(msg).not.toContain("• D");
  });
});

// ─── sendTelegram ─────────────────────────────────────────────────────────────

describe("sendTelegram", () => {
  let sendTelegram: (token: string, chatId: string, text: string) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../../src/core/notification-dispatcher.js");
    sendTelegram = mod.sendTelegram;
  });

  it("POSTs to Telegram sendMessage endpoint", async () => {
    makeHttpsMockReq(200);
    await sendTelegram("mytoken", "12345", "Hello World");
    expect(mockHttpsRequest).toHaveBeenCalledOnce();
    const callArg = mockHttpsRequest.mock.calls[0]![0] as string;
    expect(callArg).toContain("api.telegram.org");
    expect(callArg).toContain("mytoken");
    expect(callArg).toContain("sendMessage");
  });

  it("includes chat_id and text in request body", async () => {
    makeHttpsMockReq(200);
    const req = makeHttpsMockReq(200);
    await sendTelegram("tok", "999", "Test message");
    const writtenBody = (req.write.mock.calls[0]![0] as string);
    const parsed = JSON.parse(writtenBody) as { chat_id: string; text: string };
    expect(parsed.chat_id).toBe("999");
    expect(parsed.text).toBe("Test message");
  });

  it("rejects on network error", async () => {
    const req = makeHttpsMockReq(200);
    // Override: don't invoke the callback so the promise hangs until _triggerError
    mockHttpsRequest.mockImplementationOnce((..._args: unknown[]) => req);
    const send = sendTelegram("tok", "999", "msg");
    req._triggerError(new Error("ECONNREFUSED"));
    await expect(send).rejects.toThrow("ECONNREFUSED");
  });
});

// ─── sendSlack ────────────────────────────────────────────────────────────────

describe("sendSlack", () => {
  let sendSlack: (webhookUrl: string, text: string) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../../src/core/notification-dispatcher.js");
    sendSlack = mod.sendSlack;
  });

  it("POSTs JSON body to Slack webhook hostname", async () => {
    makeHttpsMockReq(200);
    await sendSlack("https://hooks.slack.com/services/T00/B00/xxx", "Slack test");
    expect(mockHttpsRequest).toHaveBeenCalledOnce();
    const opts = mockHttpsRequest.mock.calls[0]![0] as Record<string, string>;
    expect(opts["hostname"]).toBe("hooks.slack.com");
    expect(opts["method"]).toBe("POST");
  });

  it("includes text in request body", async () => {
    const req = makeHttpsMockReq(200);
    await sendSlack("https://hooks.slack.com/services/T00/B00/xxx", "Hello Slack");
    const writtenBody = (req.write.mock.calls[0]![0] as string);
    const parsed = JSON.parse(writtenBody) as { text: string };
    expect(parsed.text).toBe("Hello Slack");
  });

  it("rejects on network error", async () => {
    const req = makeHttpsMockReq(200);
    // Override: don't invoke the callback so the promise hangs until _triggerError
    mockHttpsRequest.mockImplementationOnce((..._args: unknown[]) => req);
    const send = sendSlack("https://hooks.slack.com/services/T00/B00/xxx", "msg");
    req._triggerError(new Error("ETIMEDOUT"));
    await expect(send).rejects.toThrow("ETIMEDOUT");
  });
});

// ─── drainProactiveQueue ──────────────────────────────────────────────────────

describe("drainProactiveQueue", () => {
  let drainProactiveQueue: (dataDir: string) => Promise<{ sent: number; failed: number }>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockMarkTaskDone.mockResolvedValue(undefined);
    makeHttpsMockReq(200);
    const mod = await import("../../src/core/notification-dispatcher.js");
    drainProactiveQueue = mod.drainProactiveQueue;
  });

  it("returns {sent:0, failed:0} when queue is empty", async () => {
    mockReadQueue.mockReturnValue([]);
    const result = await drainProactiveQueue(DATA_DIR);
    expect(result).toEqual({ sent: 0, failed: 0 });
  });

  it("marks mcp_tool_response tasks done without calling sendTelegram/sendSlack", async () => {
    const task = makeTask({ channel: "mcp_tool_response", type: "daily_briefing" });
    mockReadQueue.mockReturnValue([task]);
    delete process.env["TELEGRAM_BOT_TOKEN"];
    delete process.env["SLACK_WEBHOOK_URL"];

    const result = await drainProactiveQueue(DATA_DIR);

    expect(mockMarkTaskDone).toHaveBeenCalledWith(DATA_DIR, "task_1", "dispatched");
    expect(mockHttpsRequest).not.toHaveBeenCalled();
    expect(result.sent).toBe(1);
  });

  it("sends telegram task when env vars present", async () => {
    process.env["TELEGRAM_BOT_TOKEN"] = "tok123";
    process.env["TELEGRAM_CHAT_ID"] = "chat456";
    delete process.env["SLACK_WEBHOOK_URL"];

    const task = makeTask({ channel: "telegram", type: "relationship_decay_alert", slug: "acme" });
    mockReadQueue.mockReturnValue([task]);

    const result = await drainProactiveQueue(DATA_DIR);

    expect(mockHttpsRequest).toHaveBeenCalled();
    expect(mockMarkTaskDone).toHaveBeenCalledWith(DATA_DIR, "task_1", "dispatched");
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);

    delete process.env["TELEGRAM_BOT_TOKEN"];
    delete process.env["TELEGRAM_CHAT_ID"];
  });

  it("sends slack task when env vars present", async () => {
    delete process.env["TELEGRAM_BOT_TOKEN"];
    process.env["SLACK_WEBHOOK_URL"] = "https://hooks.slack.com/services/T/B/x";

    const task = makeTask({ channel: "slack", type: "deal_risk_alert", slug: "beta" });
    mockReadQueue.mockReturnValue([task]);

    const result = await drainProactiveQueue(DATA_DIR);

    expect(mockHttpsRequest).toHaveBeenCalled();
    expect(mockMarkTaskDone).toHaveBeenCalledWith(DATA_DIR, "task_1", "dispatched");
    expect(result.sent).toBe(1);

    delete process.env["SLACK_WEBHOOK_URL"];
  });

  it("skips telegram task when no token/chatId env vars", async () => {
    delete process.env["TELEGRAM_BOT_TOKEN"];
    delete process.env["TELEGRAM_CHAT_ID"];

    const task = makeTask({ channel: "telegram" });
    mockReadQueue.mockReturnValue([task]);

    const result = await drainProactiveQueue(DATA_DIR);

    // markTaskDone still called (task counted as sent)
    expect(mockMarkTaskDone).toHaveBeenCalled();
    expect(mockHttpsRequest).not.toHaveBeenCalled();
    expect(result.sent).toBe(1);
  });

  it("skips slack task when no webhook env var", async () => {
    delete process.env["SLACK_WEBHOOK_URL"];

    const task = makeTask({ channel: "slack" });
    mockReadQueue.mockReturnValue([task]);

    const result = await drainProactiveQueue(DATA_DIR);

    expect(mockHttpsRequest).not.toHaveBeenCalled();
    expect(mockMarkTaskDone).toHaveBeenCalled();
    expect(result.sent).toBe(1);
  });

  it("counts failed when markTaskDone throws", async () => {
    mockMarkTaskDone.mockRejectedValueOnce(new Error("lock error"));
    const task = makeTask({ channel: "mcp_tool_response" });
    mockReadQueue.mockReturnValue([task]);

    const result = await drainProactiveQueue(DATA_DIR);

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
  });

  it("counts failed when sendTelegram throws", async () => {
    process.env["TELEGRAM_BOT_TOKEN"] = "tok";
    process.env["TELEGRAM_CHAT_ID"] = "chat";

    const req = makeHttpsMockReq(200);
    // Override: don't invoke callback — error will be triggered manually
    mockHttpsRequest.mockImplementationOnce((..._args: unknown[]) => req);
    const task = makeTask({ channel: "telegram" });
    mockReadQueue.mockReturnValue([task]);

    const drain = drainProactiveQueue(DATA_DIR);
    req._triggerError(new Error("network down"));
    const result = await drain;

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
    expect(mockMarkTaskDone).not.toHaveBeenCalled();

    delete process.env["TELEGRAM_BOT_TOKEN"];
    delete process.env["TELEGRAM_CHAT_ID"];
  });

  it("skips non-pending tasks", async () => {
    const done = makeTask({ status: "done" });
    const failed = makeTask({ id: "task_2", status: "failed" });
    const pending = makeTask({ id: "task_3", status: "pending" });
    mockReadQueue.mockReturnValue([done, failed, pending]);

    const result = await drainProactiveQueue(DATA_DIR);

    expect(mockMarkTaskDone).toHaveBeenCalledTimes(1);
    expect(mockMarkTaskDone).toHaveBeenCalledWith(DATA_DIR, "task_3", "dispatched");
    expect(result.sent).toBe(1);
  });

  it("processes multiple tasks and sums counts", async () => {
    const tasks = [
      makeTask({ id: "t1", channel: "mcp_tool_response" }),
      makeTask({ id: "t2", channel: "mcp_tool_response" }),
      makeTask({ id: "t3", channel: "mcp_tool_response" }),
    ];
    mockReadQueue.mockReturnValue(tasks);

    const result = await drainProactiveQueue(DATA_DIR);

    expect(mockMarkTaskDone).toHaveBeenCalledTimes(3);
    expect(result.sent).toBe(3);
    expect(result.failed).toBe(0);
  });
});

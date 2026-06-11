import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock https.request for Telegram API calls
const mockHttpsRequest = vi.hoisted(() => vi.fn());
vi.mock("https", () => ({ default: { request: mockHttpsRequest } }));

// Mock summarizeEmail from llm.ts
const mockSummarizeEmail = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    summary: "Customer asks about a demo.",
    sentiment: "neutral",
    nextSteps: ["Schedule a demo", "Send a quote"],
  })
);
vi.mock("../../src/core/llm.js", () => ({
  summarizeEmail: mockSummarizeEmail,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Builds a fake https request/response pair that resolves successfully */
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

const AGENT_CONFIG = JSON.stringify({
  slug: "acme-corp",
  channel: "telegram",
  wakeOn: ["email"],
  createdAt: "2026-01-01T00:00:00.000Z",
  lastWake: null,
  telegramChatId: "999888",
});

const EMAIL_CONTEXT = {
  trigger: "email" as const,
  subject: "Question about pricing",
  from: "alice@acme.com",
  snippet: "Hi, could you send us a quote?",
};

// ─── notifyAgentWake ──────────────────────────────────────────────────────────

describe("notifyAgentWake", () => {
  beforeEach(() => {
    vol.reset();
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env["TELEGRAM_BOT_TOKEN"];
    delete process.env["TELEGRAM_CHAT_ID"];
  });

  it("sends Telegram message when config and token are set", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/agents/acme-corp.agent.json`]: AGENT_CONFIG,
    });
    process.env["TELEGRAM_BOT_TOKEN"] = "bot_tok_123";
    makeHttpsMockReq(200);

    const { notifyAgentWake } = await import("../../src/core/agent-notifier.js");
    await notifyAgentWake(DATA_DIR, "acme-corp", EMAIL_CONTEXT);

    expect(mockHttpsRequest).toHaveBeenCalledOnce();
    const callArg = mockHttpsRequest.mock.calls[0]![0] as string;
    expect(callArg).toContain("api.telegram.org");
    expect(callArg).toContain("bot_tok_123");
    expect(callArg).toContain("sendMessage");
  });

  it("includes customer name and subject in the Telegram message body", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/agents/acme-corp.agent.json`]: AGENT_CONFIG,
    });
    process.env["TELEGRAM_BOT_TOKEN"] = "tok";
    const req = makeHttpsMockReq(200);

    const { notifyAgentWake } = await import("../../src/core/agent-notifier.js");
    await notifyAgentWake(DATA_DIR, "acme-corp", EMAIL_CONTEXT);

    const writtenBody = req.write.mock.calls[0]![0] as string;
    const parsed = JSON.parse(writtenBody) as { chat_id: string; text: string };
    expect(parsed.chat_id).toBe("999888");
    expect(parsed.text).toContain("acme-corp");
    expect(parsed.text).toContain("Question about pricing");
  });

  it("uses TELEGRAM_CHAT_ID env var when telegramChatId is absent from config", async () => {
    const configWithoutChatId = JSON.stringify({
      slug: "beta-gmbh",
      channel: "telegram",
      wakeOn: ["email"],
      createdAt: "2026-01-01T00:00:00.000Z",
      lastWake: null,
    });
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/agents/beta-gmbh.agent.json`]: configWithoutChatId,
    });
    process.env["TELEGRAM_BOT_TOKEN"] = "tok";
    process.env["TELEGRAM_CHAT_ID"] = "env_chat_id";
    const req = makeHttpsMockReq(200);

    const { notifyAgentWake } = await import("../../src/core/agent-notifier.js");
    await notifyAgentWake(DATA_DIR, "beta-gmbh", {
      ...EMAIL_CONTEXT,
      subject: "Follow up",
      from: "bob@beta.de",
    });

    const writtenBody = req.write.mock.calls[0]![0] as string;
    const parsed = JSON.parse(writtenBody) as { chat_id: string };
    expect(parsed.chat_id).toBe("env_chat_id");
  });

  it("silently skips when no agent config exists", async () => {
    vol.fromJSON({});
    process.env["TELEGRAM_BOT_TOKEN"] = "tok";

    const { notifyAgentWake } = await import("../../src/core/agent-notifier.js");
    await expect(notifyAgentWake(DATA_DIR, "unknown-slug", EMAIL_CONTEXT)).resolves.toBeUndefined();
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it("silently skips when no TELEGRAM_BOT_TOKEN env var", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/agents/acme-corp.agent.json`]: AGENT_CONFIG,
    });
    // TELEGRAM_BOT_TOKEN intentionally not set

    const { notifyAgentWake } = await import("../../src/core/agent-notifier.js");
    await expect(notifyAgentWake(DATA_DIR, "acme-corp", EMAIL_CONTEXT)).resolves.toBeUndefined();
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it("silently skips when no chat id in config or env", async () => {
    const configWithoutChatId = JSON.stringify({
      slug: "gamma-ag",
      channel: "telegram",
      wakeOn: ["email"],
      createdAt: "2026-01-01T00:00:00.000Z",
      lastWake: null,
    });
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/agents/gamma-ag.agent.json`]: configWithoutChatId,
    });
    process.env["TELEGRAM_BOT_TOKEN"] = "tok";
    delete process.env["TELEGRAM_CHAT_ID"];

    const { notifyAgentWake } = await import("../../src/core/agent-notifier.js");
    await expect(notifyAgentWake(DATA_DIR, "gamma-ag", EMAIL_CONTEXT)).resolves.toBeUndefined();
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it("updates lastWake in agent config file after successful send", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/agents/acme-corp.agent.json`]: AGENT_CONFIG,
    });
    process.env["TELEGRAM_BOT_TOKEN"] = "tok";
    makeHttpsMockReq(200);

    const { notifyAgentWake } = await import("../../src/core/agent-notifier.js");
    await notifyAgentWake(DATA_DIR, "acme-corp", EMAIL_CONTEXT);

    const updated = JSON.parse(
      vol.readFileSync(`${DATA_DIR}/.agentic/agents/acme-corp.agent.json`, "utf-8") as string
    ) as { lastWake: string | null };
    expect(updated.lastWake).not.toBeNull();
    expect(typeof updated.lastWake).toBe("string");
    // Should be a recent ISO timestamp
    const ts = new Date(updated.lastWake as string).getTime();
    expect(Number.isNaN(ts)).toBe(false);
  });

  it("calls summarizeEmail with subject, snippet, and from", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/agents/acme-corp.agent.json`]: AGENT_CONFIG,
    });
    process.env["TELEGRAM_BOT_TOKEN"] = "tok";
    makeHttpsMockReq(200);

    const { notifyAgentWake } = await import("../../src/core/agent-notifier.js");
    await notifyAgentWake(DATA_DIR, "acme-corp", EMAIL_CONTEXT);

    expect(mockSummarizeEmail).toHaveBeenCalledOnce();
    expect(mockSummarizeEmail).toHaveBeenCalledWith(
      EMAIL_CONTEXT.subject,
      EMAIL_CONTEXT.snippet,
      EMAIL_CONTEXT.from,
      "English"
    );
  });

  it("includes LLM summary in the Telegram message text", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/agents/acme-corp.agent.json`]: AGENT_CONFIG,
    });
    process.env["TELEGRAM_BOT_TOKEN"] = "tok";
    const req = makeHttpsMockReq(200);

    const { notifyAgentWake } = await import("../../src/core/agent-notifier.js");
    await notifyAgentWake(DATA_DIR, "acme-corp", EMAIL_CONTEXT);

    const writtenBody = req.write.mock.calls[0]![0] as string;
    const parsed = JSON.parse(writtenBody) as { text: string };
    expect(parsed.text).toContain("Customer asks about a demo.");
  });

  it("includes suggested action (first nextStep) in the Telegram message", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/agents/acme-corp.agent.json`]: AGENT_CONFIG,
    });
    process.env["TELEGRAM_BOT_TOKEN"] = "tok";
    const req = makeHttpsMockReq(200);

    const { notifyAgentWake } = await import("../../src/core/agent-notifier.js");
    await notifyAgentWake(DATA_DIR, "acme-corp", EMAIL_CONTEXT);

    const writtenBody = req.write.mock.calls[0]![0] as string;
    const parsed = JSON.parse(writtenBody) as { text: string };
    // First nextStep from the mock: "Schedule a demo"
    expect(parsed.text).toContain("Schedule a demo");
  });

  it("falls back to 'Follow up within 24h' when nextSteps is empty", async () => {
    mockSummarizeEmail.mockResolvedValueOnce({
      summary: "Quick follow-up question.",
      sentiment: "neutral",
      nextSteps: [],
    });
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/agents/acme-corp.agent.json`]: AGENT_CONFIG,
    });
    process.env["TELEGRAM_BOT_TOKEN"] = "tok";
    const req = makeHttpsMockReq(200);

    const { notifyAgentWake } = await import("../../src/core/agent-notifier.js");
    await notifyAgentWake(DATA_DIR, "acme-corp", EMAIL_CONTEXT);

    const writtenBody = req.write.mock.calls[0]![0] as string;
    const parsed = JSON.parse(writtenBody) as { text: string };
    expect(parsed.text).toContain("Follow up within 24h");
  });

  it("handles HTTPS error gracefully — does not throw", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/agents/acme-corp.agent.json`]: AGENT_CONFIG,
    });
    process.env["TELEGRAM_BOT_TOKEN"] = "tok";

    // Set up a req that will error, but DON'T invoke callback (so no auto-resolve)
    let errorCb: ((e: Error) => void) | undefined;
    const req = {
      on: vi.fn((event: string, cb: (e: Error) => void) => {
        if (event === "error") errorCb = cb;
      }),
      write: vi.fn(),
      end: vi.fn(),
    };
    mockHttpsRequest.mockImplementation((..._args: unknown[]) => req);

    const { notifyAgentWake } = await import("../../src/core/agent-notifier.js");
    const notifyPromise = notifyAgentWake(DATA_DIR, "acme-corp", EMAIL_CONTEXT);

    // Flush microtasks so that summarizeEmail (async mock) resolves and
    // https.request is called before we trigger the network error.
    await Promise.resolve();
    await Promise.resolve();

    // Trigger a network error
    errorCb?.(new Error("ECONNREFUSED"));

    // notifyAgentWake swallows the error — resolves (not rejects)
    await expect(notifyPromise).resolves.toBeUndefined();
  });

  it("does not update lastWake when HTTPS send fails", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/agents/acme-corp.agent.json`]: AGENT_CONFIG,
    });
    process.env["TELEGRAM_BOT_TOKEN"] = "tok";

    let errorCb: ((e: Error) => void) | undefined;
    const req = {
      on: vi.fn((event: string, cb: (e: Error) => void) => {
        if (event === "error") errorCb = cb;
      }),
      write: vi.fn(),
      end: vi.fn(),
    };
    mockHttpsRequest.mockImplementation((..._args: unknown[]) => req);

    const { notifyAgentWake } = await import("../../src/core/agent-notifier.js");
    const notifyPromise = notifyAgentWake(DATA_DIR, "acme-corp", EMAIL_CONTEXT);

    // Flush microtasks so that summarizeEmail (async mock) resolves and
    // https.request is called before we trigger the network error.
    await Promise.resolve();
    await Promise.resolve();

    errorCb?.(new Error("network down"));
    await notifyPromise;

    const config = JSON.parse(
      vol.readFileSync(`${DATA_DIR}/.agentic/agents/acme-corp.agent.json`, "utf-8") as string
    ) as { lastWake: string | null };
    // lastWake should remain null since send failed
    expect(config.lastWake).toBeNull();
  });
});

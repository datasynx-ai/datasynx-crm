import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @anthropic-ai/sdk before importing the module under test
vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
    __mockCreate: mockCreate,
  };
});

// Import after mock is set up
import {
  callLlm,
  summarizeEmail,
  recognizeCustomer,
  resetLlmClient,
  resetLlmCircuit,
  type EmailSummary,
  type CustomerMatch,
} from "../../src/core/llm.js";

async function getMockCreate(): Promise<ReturnType<typeof vi.fn>> {
  const mod = (await import("@anthropic-ai/sdk")) as {
    __mockCreate: ReturnType<typeof vi.fn>;
  };
  return mod.__mockCreate;
}

describe("summarizeEmail", () => {
  beforeEach(() => {
    resetLlmClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env["ANTHROPIC_API_KEY"];
  });

  it("returns fallback when no API key", async () => {
    delete process.env["ANTHROPIC_API_KEY"];

    const result = await summarizeEmail(
      "Meeting follow-up",
      "Thanks for your time today discussing the project requirements.",
      "alice@example.com"
    );

    expect(result.sentiment).toBe("neutral");
    expect(result.nextSteps).toEqual([]);
    expect(result.summary).toContain("Thanks for your time");
  });

  it("truncates long snippets to 300 chars in fallback", async () => {
    delete process.env["ANTHROPIC_API_KEY"];

    const longSnippet = "x".repeat(500);
    const result = await summarizeEmail("Subject", longSnippet, "test@example.com");

    expect(result.summary.length).toBeLessThanOrEqual(300);
    expect(result.sentiment).toBe("neutral");
    expect(result.nextSteps).toEqual([]);
  });

  it("calls Anthropic client when API key exists", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";

    const mockCreate = await getMockCreate();
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            summary: "Alice bedankt sich für das Gespräch.",
            sentiment: "positive",
            nextSteps: ["Folgemail senden"],
          }),
        },
      ],
    });

    const result = await summarizeEmail(
      "Meeting follow-up",
      "Thanks for your time today.",
      "alice@example.com"
    );

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result.sentiment).toBe("positive");
    expect(result.summary).toBe("Alice bedankt sich für das Gespräch.");
    expect(result.nextSteps).toEqual(["Folgemail senden"]);
  });

  it("passes cache_control on system prompt for prompt caching", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";

    const mockCreate = await getMockCreate();
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            summary: "Test summary.",
            sentiment: "neutral",
            nextSteps: [],
          }),
        },
      ],
    });

    await summarizeEmail("Subject", "Content", "from@example.com");

    const callArgs = mockCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    const system = callArgs?.["system"] as Array<Record<string, unknown>>;
    expect(system).toBeDefined();
    expect(Array.isArray(system)).toBe(true);
    const hasCache = system.some(
      (block) =>
        block["cache_control"] !== undefined &&
        (block["cache_control"] as Record<string, string>)["type"] === "ephemeral"
    );
    expect(hasCache).toBe(true);
  });

  it("returns fallback on JSON parse error", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";

    const mockCreate = await getMockCreate();
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: "this is not valid json {{{",
        },
      ],
    });

    const snippet = "Some email content here";
    const result = await summarizeEmail("Subject", snippet, "from@example.com");

    // Falls back to fallback behavior
    expect(result.sentiment).toBe("neutral");
    expect(result.nextSteps).toEqual([]);
    expect(result.summary).toBe(snippet.slice(0, 300));
  });

  it("returns fallback on API error", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";

    const mockCreate = await getMockCreate();
    mockCreate.mockRejectedValueOnce(new Error("API unavailable"));

    const snippet = "Email content";
    const result = await summarizeEmail("Subject", snippet, "from@example.com");

    expect(result.sentiment).toBe("neutral");
    expect(result.nextSteps).toEqual([]);
    expect(result.summary).toBe(snippet.slice(0, 300));
  });
});

describe("recognizeCustomer", () => {
  beforeEach(() => {
    resetLlmClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env["ANTHROPIC_API_KEY"];
  });

  it("returns null when no candidates provided", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";

    const result = await recognizeCustomer("Some transcript content", []);

    expect(result.slug).toBeNull();
    expect(result.confidence).toBe("low");
  });

  it("returns null when no API key", async () => {
    delete process.env["ANTHROPIC_API_KEY"];

    const result = await recognizeCustomer("Some transcript content", [
      { slug: "acme-corp", name: "Acme Corp" },
    ]);

    expect(result.slug).toBeNull();
    expect(result.confidence).toBe("low");
  });

  it("calls client with correct slug list", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";

    const mockCreate = await getMockCreate();
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({ slug: "acme-corp", confidence: "high" }),
        },
      ],
    });

    const candidates = [
      { slug: "acme-corp", name: "Acme Corp" },
      { slug: "beta-gmbh", name: "Beta GmbH" },
    ];

    const result = await recognizeCustomer(
      "We discussed the project with the team at Acme...",
      candidates
    );

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result.slug).toBe("acme-corp");
    expect(result.confidence).toBe("high");

    // Verify user prompt contains candidate slugs
    const callArgs = mockCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    const messages = callArgs?.["messages"] as Array<Record<string, unknown>>;
    const userContent = messages?.[0]?.["content"] as string;
    expect(userContent).toContain("acme-corp");
    expect(userContent).toContain("beta-gmbh");
  });

  it("truncates transcript to 1000 chars in user prompt", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";

    const mockCreate = await getMockCreate();
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({ slug: "acme-corp", confidence: "medium" }),
        },
      ],
    });

    const longTranscript = "x".repeat(2000);

    await recognizeCustomer(longTranscript, [
      { slug: "acme-corp", name: "Acme Corp" },
    ]);

    const callArgs = mockCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    const messages = callArgs?.["messages"] as Array<Record<string, unknown>>;
    const userContent = messages?.[0]?.["content"] as string;
    // The transcript portion should be truncated to 1000 chars
    expect(userContent.length).toBeLessThan(1200); // generous bound accounting for prefix text
  });

  it("returns null on JSON parse error from API", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";

    const mockCreate = await getMockCreate();
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: "not json",
        },
      ],
    });

    const result = await recognizeCustomer("transcript", [
      { slug: "acme-corp", name: "Acme Corp" },
    ]);

    expect(result.slug).toBeNull();
    expect(result.confidence).toBe("low");
  });

  it("returns null on API error", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";

    const mockCreate = await getMockCreate();
    mockCreate.mockRejectedValueOnce(new Error("Network error"));

    const result = await recognizeCustomer("transcript", [
      { slug: "acme-corp", name: "Acme Corp" },
    ]);

    expect(result.slug).toBeNull();
    expect(result.confidence).toBe("low");
  });
});

// ─── callLlm — circuit breaker + response guard ────────────────────────────────

describe("callLlm — circuit breaker", () => {
  beforeEach(() => {
    resetLlmClient();
    resetLlmCircuit();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env["ANTHROPIC_API_KEY"];
    resetLlmCircuit();
  });

  it("trips open after 3 API failures and subsequent call throws Circuit open", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";
    const mockCreate = await getMockCreate();
    mockCreate.mockRejectedValue(new Error("API down"));

    await expect(callLlm("p")).rejects.toThrow("API down");
    await expect(callLlm("p")).rejects.toThrow("API down");
    await expect(callLlm("p")).rejects.toThrow("API down");
    await expect(callLlm("p")).rejects.toThrow("Circuit open");
  });

  it("missing API key does NOT trip the circuit", async () => {
    delete process.env["ANTHROPIC_API_KEY"];

    await expect(callLlm("p")).rejects.toThrow("ANTHROPIC_API_KEY not set");
    await expect(callLlm("p")).rejects.toThrow("ANTHROPIC_API_KEY not set");
    await expect(callLlm("p")).rejects.toThrow("ANTHROPIC_API_KEY not set");
    // 4th call still throws config error, NOT "Circuit open"
    await expect(callLlm("p")).rejects.toThrow("ANTHROPIC_API_KEY not set");
  });

  it("circuit resets after a successful call", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";
    const mockCreate = await getMockCreate();
    mockCreate
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ok" }] });

    await expect(callLlm("p")).rejects.toThrow("fail");
    await expect(callLlm("p")).rejects.toThrow("fail");
    expect(await callLlm("p")).toBe("ok");

    // Circuit is closed again; next API error propagates normally
    mockCreate.mockRejectedValue(new Error("another fail"));
    await expect(callLlm("p")).rejects.toThrow("another fail");
  });
});

describe("callLlm — response size guard", () => {
  beforeEach(() => {
    resetLlmClient();
    resetLlmCircuit();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env["ANTHROPIC_API_KEY"];
    resetLlmCircuit();
  });

  it("returns response text when within size limit", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";
    const mockCreate = await getMockCreate();
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "hello" }] });
    expect(await callLlm("p")).toBe("hello");
  });

  it("throws when response exceeds size limit", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";
    const mockCreate = await getMockCreate();
    const giant = "x".repeat(513 * 1024);
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: giant }] });
    await expect(callLlm("p")).rejects.toThrow("LLM response exceeds");
  });
});

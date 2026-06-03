import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

const mockGenerateQuote = vi.hoisted(() => vi.fn());
const mockReadQuote = vi.hoisted(() => vi.fn());
const mockListQuotes = vi.hoisted(() => vi.fn());

vi.mock("../../../src/core/quote-generator.js", () => ({
  generateQuote: mockGenerateQuote,
  readQuote: mockReadQuote,
  listQuotes: mockListQuotes,
}));

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/data";

function makeQuote(quoteNumber = "Q-2026-001") {
  return {
    quoteNumber,
    slug: "acme-corp",
    dealName: "Acme Enterprise Deal",
    lineItems: [{ description: "License", quantity: 1, unitPrice: 5000, total: 5000 }],
    subtotal: 5000,
    vatPercent: 19,
    vat: 950,
    total: 5950,
    currency: "EUR",
    createdAt: "2026-05-30T10:00:00Z",
    validUntilDays: 30,
    validUntil: "2026-06-29",
    status: "draft" as const,
    htmlPath: "/data/.agentic/quotes/Q-2026-001.html",
  };
}

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
});

// ─── generate_quote ────────────────────────────────────────────────────────────

describe("handleGenerateQuote", () => {
  it("returns quote metadata on success", async () => {
    mockGenerateQuote.mockResolvedValue(makeQuote());
    const { handleGenerateQuote } = await import("../../../src/mcp/tools/generate-quote.js");
    const result = await handleGenerateQuote(
      {
        slug: "acme-corp",
        dealName: "Acme Enterprise Deal",
        lineItems: [{ description: "License", quantity: 1, unitPrice: 5000 }],
      },
      DATA_DIR
    );
    const parsed = JSON.parse(result.content[0].text) as {
      quoteNumber: string;
      total: number;
      currency: string;
      status: string;
    };
    expect(parsed.quoteNumber).toBe("Q-2026-001");
    expect(parsed.total).toBe(5950);
    expect(parsed.currency).toBe("EUR");
    expect(parsed.status).toBe("draft");
  });

  it("returns error message when generateQuote throws", async () => {
    mockGenerateQuote.mockRejectedValue(new Error("Failed to generate quote"));
    const { handleGenerateQuote } = await import("../../../src/mcp/tools/generate-quote.js");
    const result = await handleGenerateQuote(
      {
        slug: "acme",
        dealName: "Test",
        lineItems: [{ description: "X", quantity: 1, unitPrice: 100 }],
      },
      DATA_DIR
    );
    const parsed = JSON.parse(result.content[0].text) as { error: string };
    expect(parsed.error).toContain("Failed to generate");
  });

  it("passes optional params to generateQuote", async () => {
    mockGenerateQuote.mockResolvedValue(makeQuote());
    const { handleGenerateQuote } = await import("../../../src/mcp/tools/generate-quote.js");
    await handleGenerateQuote(
      {
        slug: "acme",
        dealName: "Deal",
        lineItems: [{ description: "X", quantity: 1, unitPrice: 100 }],
        vatPercent: 20,
        validUntilDays: 14,
        currency: "GBP",
      },
      DATA_DIR
    );
    expect(mockGenerateQuote).toHaveBeenCalledWith(
      DATA_DIR,
      expect.objectContaining({
        vatPercent: 20,
        validUntilDays: 14,
        currency: "GBP",
      })
    );
  });

  it("registered handler invokes handleGenerateQuote with optional params", async () => {
    mockGenerateQuote.mockResolvedValue(makeQuote());
    const { registerGenerateQuote } = await import("../../../src/mcp/tools/generate-quote.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerGenerateQuote(fakeServer as never, DATA_DIR);
    const result = await capturedHandler!({
      slug: "acme",
      dealName: "Acme Deal",
      lineItems: [{ description: "License", quantity: 1, unitPrice: 5000 }],
      vatPercent: 19,
      validUntilDays: 30,
      currency: "EUR",
    });
    const parsed = JSON.parse(result.content[0]!.text) as { quoteNumber: string };
    expect(parsed.quoteNumber).toBe("Q-2026-001");
  });
});

// ─── get_quote_status ──────────────────────────────────────────────────────────

describe("handleGetQuoteStatus", () => {
  it("returns error when specific quote not found", async () => {
    mockReadQuote.mockReturnValue(null);
    const { handleGetQuoteStatus } = await import("../../../src/mcp/tools/get-quote-status.js");
    const result = await handleGetQuoteStatus({ quoteNumber: "Q-2026-999" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { error: string };
    expect(parsed.error).toContain("Q-2026-999");
  });

  it("returns quote when found by quoteNumber", async () => {
    mockReadQuote.mockReturnValue(makeQuote("Q-2026-001"));
    const { handleGetQuoteStatus } = await import("../../../src/mcp/tools/get-quote-status.js");
    const result = await handleGetQuoteStatus({ quoteNumber: "Q-2026-001" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { quoteNumber: string };
    expect(parsed.quoteNumber).toBe("Q-2026-001");
  });

  it("lists all quotes for slug when no quoteNumber", async () => {
    mockListQuotes.mockReturnValue([makeQuote("Q-2026-001"), makeQuote("Q-2026-002")]);
    const { handleGetQuoteStatus } = await import("../../../src/mcp/tools/get-quote-status.js");
    const result = await handleGetQuoteStatus({ slug: "acme-corp" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { quotes: unknown[] };
    expect(parsed.quotes.length).toBe(2);
    expect(mockListQuotes).toHaveBeenCalledWith(DATA_DIR, "acme-corp");
  });

  it("lists all quotes when neither quoteNumber nor slug provided", async () => {
    mockListQuotes.mockReturnValue([]);
    const { handleGetQuoteStatus } = await import("../../../src/mcp/tools/get-quote-status.js");
    await handleGetQuoteStatus({}, DATA_DIR);
    expect(mockListQuotes).toHaveBeenCalledWith(DATA_DIR, undefined);
  });

  it("registered handler invokes handleGetQuoteStatus with optional params", async () => {
    mockReadQuote.mockReturnValue(makeQuote("Q-2026-001"));
    const { registerGetQuoteStatus } = await import("../../../src/mcp/tools/get-quote-status.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerGetQuoteStatus(fakeServer as never, DATA_DIR);
    const result = await capturedHandler!({ quoteNumber: "Q-2026-001", slug: "acme-corp" });
    const parsed = JSON.parse(result.content[0]!.text) as { quoteNumber: string };
    expect(parsed.quoteNumber).toBe("Q-2026-001");
  });
});

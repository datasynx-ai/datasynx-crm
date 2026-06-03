import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Quote } from "../../src/schemas/quote.js";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGenerateQuote = vi.hoisted(() => vi.fn());
const mockListQuotes = vi.hoisted(() => vi.fn());
const mockReadQuote = vi.hoisted(() => vi.fn());

vi.mock("../../src/core/quote-generator.js", () => ({
  generateQuote: mockGenerateQuote,
  listQuotes: mockListQuotes,
  readQuote: mockReadQuote,
}));

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    quoteNumber: "QT-2026-0001",
    slug: "acme",
    dealName: "Enterprise License",
    lineItems: [{ description: "Consulting", quantity: 1, unitPrice: 5000, total: 5000 }],
    subtotal: 5000,
    vatPercent: 19,
    vat: 950,
    total: 5950,
    currency: "EUR",
    validUntil: "2026-06-30",
    status: "draft",
    createdAt: "2026-06-01T00:00:00Z",
    htmlPath: "/data/.agentic/quotes/QT-2026-0001.html",
    ...overrides,
  };
}

const DATA_DIR = "/data";

describe("quoteCommand generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("generates quote and prints result", async () => {
    mockGenerateQuote.mockResolvedValue(makeQuote());
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { quoteCommand } = await import("../../src/commands/quote.js");
    await quoteCommand.parseAsync([
      "node",
      "quote",
      "generate",
      "acme",
      "--deal",
      "Enterprise License",
      "--items",
      "Consulting 1 5000",
    ]);

    expect(mockGenerateQuote).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("QT-2026-0001"));
    consoleSpy.mockRestore();
  });

  it("exits on generate error", async () => {
    mockGenerateQuote.mockRejectedValue(new Error("template missing"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as () => never);

    const { quoteCommand } = await import("../../src/commands/quote.js");
    await expect(
      quoteCommand.parseAsync(["node", "quote", "generate", "acme", "--deal", "Deal"])
    ).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("template missing"));
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("quoteCommand list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("shows list of quotes", async () => {
    mockListQuotes.mockReturnValue([makeQuote()]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { quoteCommand } = await import("../../src/commands/quote.js");
    await quoteCommand.parseAsync(["node", "quote", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("QT-2026-0001"));
    consoleSpy.mockRestore();
  });

  it("shows 'No quotes found' when empty", async () => {
    mockListQuotes.mockReturnValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { quoteCommand } = await import("../../src/commands/quote.js");
    await quoteCommand.parseAsync(["node", "quote", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No quotes"));
    consoleSpy.mockRestore();
  });
});

describe("quoteCommand generate — branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("uses default line items when --items not provided", async () => {
    mockGenerateQuote.mockResolvedValue(makeQuote());
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { quoteCommand } = await import("../../src/commands/quote.js");
    await quoteCommand.parseAsync(["node", "quote", "generate", "acme", "--deal", "Deal"]);

    // The default 'Service 1 1000' item is used when --items omitted
    const callArgs = mockGenerateQuote.mock.calls[0]?.[1] as { lineItems: unknown[] };
    expect(callArgs.lineItems).toHaveLength(1);
    consoleSpy.mockRestore();
  });

  it("handles single-word item (description-only, no qty/price)", async () => {
    mockGenerateQuote.mockResolvedValue(makeQuote());
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { quoteCommand } = await import("../../src/commands/quote.js");
    await quoteCommand.parseAsync([
      "node",
      "quote",
      "generate",
      "acme",
      "--deal",
      "Deal",
      "--items",
      "service",
    ]);

    const callArgs = mockGenerateQuote.mock.calls[0]?.[1] as {
      lineItems: Array<{ description: string }>;
    };
    expect(callArgs.lineItems[0]?.description).toBe("service");
    consoleSpy.mockRestore();
  });
});

describe("quoteCommand get", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("shows quote details", async () => {
    mockReadQuote.mockReturnValue(makeQuote());
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { quoteCommand } = await import("../../src/commands/quote.js");
    await quoteCommand.parseAsync(["node", "quote", "get", "QT-2026-0001"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("QT-2026-0001"));
    consoleSpy.mockRestore();
  });

  it("exits when quote not found", async () => {
    mockReadQuote.mockReturnValue(null);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as () => never);

    const { quoteCommand } = await import("../../src/commands/quote.js");
    await expect(quoteCommand.parseAsync(["node", "quote", "get", "QT-9999"])).rejects.toThrow(
      "process.exit"
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("quoteCommand — process.cwd() fallbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["DXCRM_DATA_DIR"];
    mockGenerateQuote.mockResolvedValue(makeQuote());
    mockListQuotes.mockReturnValue([makeQuote()]);
    mockReadQuote.mockReturnValue(makeQuote());
  });

  afterEach(() => {
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("generate falls back to process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { quoteCommand } = await import("../../src/commands/quote.js");
    await quoteCommand.parseAsync(["node", "quote", "generate", "acme", "--deal", "Deal"]);
    consoleSpy.mockRestore();
  });

  it("list falls back to process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { quoteCommand } = await import("../../src/commands/quote.js");
    await quoteCommand.parseAsync(["node", "quote", "list"]);
    consoleSpy.mockRestore();
  });

  it("get falls back to process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { quoteCommand } = await import("../../src/commands/quote.js");
    await quoteCommand.parseAsync(["node", "quote", "get", "QT-2026-0001"]);
    consoleSpy.mockRestore();
  });
});

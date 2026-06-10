import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";

const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

const DATA_DIR = "/data";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  delete process.env["STRIPE_API_KEY"];
});

afterEach(() => {
  delete process.env["STRIPE_API_KEY"];
  vi.unstubAllGlobals();
});

async function seedQuote() {
  const { generateQuote } = await import("../../../src/core/quote-generator.js");
  vol.mkdirSync(`${DATA_DIR}/customers/acme`, { recursive: true });
  vol.writeFileSync(`${DATA_DIR}/customers/acme/main_facts.md`, "---\nname: Acme\n---\n");
  return generateQuote(DATA_DIR, {
    slug: "acme",
    dealName: "Enterprise",
    lineItems: [{ description: "Seats", quantity: 10, unitPrice: 50 }],
    vatPercent: 19,
  });
}

function parse(res: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
}

describe("send_quote (#49, #69)", () => {
  it("mints a verifiable public link and flips draft → sent", async () => {
    const quote = await seedQuote();
    const { handleSendQuote } = await import("../../../src/mcp/tools/send-quote.js");
    const res = parse(
      await handleSendQuote({ slug: "acme", quoteNumber: quote.quoteNumber }, DATA_DIR)
    );
    expect(res["success"]).toBe(true);
    expect(res["status"]).toBe("sent");
    expect(String(res["link"])).toContain("/q/");

    const { verifyQuoteToken } = await import("../../../src/core/quote-link.js");
    const token = String(res["link"]).split("/q/")[1]!;
    expect(verifyQuoteToken(token)?.q).toBe(quote.quoteNumber);

    const { readQuote } = await import("../../../src/core/quote-generator.js");
    expect(readQuote(DATA_DIR, quote.quoteNumber)?.status).toBe("sent");
  });

  it("rejects an unknown quote or a slug mismatch", async () => {
    const quote = await seedQuote();
    const { handleSendQuote } = await import("../../../src/mcp/tools/send-quote.js");
    const missing = parse(
      await handleSendQuote({ slug: "acme", quoteNumber: "Q-2026-999" }, DATA_DIR)
    );
    expect(missing["success"]).toBe(false);
    const foreign = parse(
      await handleSendQuote({ slug: "other", quoteNumber: quote.quoteNumber }, DATA_DIR)
    );
    expect(foreign["success"]).toBe(false);
  });

  it("attaches a Stripe payment link when the API key is configured", async () => {
    const quote = await seedQuote();
    process.env["STRIPE_API_KEY"] = "sk_test";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "price_1" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://pay.stripe.example/x" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { handleSendQuote } = await import("../../../src/mcp/tools/send-quote.js");
    const res = parse(
      await handleSendQuote(
        { slug: "acme", quoteNumber: quote.quoteNumber, validDays: 14 },
        DATA_DIR
      )
    );
    expect(res["paymentLinkUrl"]).toBe("https://pay.stripe.example/x");
    expect(res["expiresInDays"]).toBe(14);

    // persisted on the quote so a re-send doesn't mint a second link
    const { readQuote } = await import("../../../src/core/quote-generator.js");
    expect(readQuote(DATA_DIR, quote.quoteNumber)?.paymentLinkUrl).toBe(
      "https://pay.stripe.example/x"
    );
  });

  it("sends without a payment link when Stripe is unreachable", async () => {
    const quote = await seedQuote();
    process.env["STRIPE_API_KEY"] = "sk_test";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { handleSendQuote } = await import("../../../src/mcp/tools/send-quote.js");
    const res = parse(
      await handleSendQuote({ slug: "acme", quoteNumber: quote.quoteNumber }, DATA_DIR)
    );
    expect(res["success"]).toBe(true);
    expect(res["paymentLinkUrl"]).toBeUndefined();
  });
});

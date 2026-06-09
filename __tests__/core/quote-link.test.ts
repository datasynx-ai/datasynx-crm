import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

const mockAppendInteraction = vi.hoisted(() => vi.fn());
vi.mock("../../src/fs/interactions-writer.js", () => ({
  appendInteraction: mockAppendInteraction,
}));

const DATA_DIR = "/data";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  mockAppendInteraction.mockResolvedValue(undefined);
});

async function seedQuote(status = "sent") {
  const { generateQuote } = await import("../../src/core/quote-generator.js");
  vol.mkdirSync(`${DATA_DIR}/customers/acme`, { recursive: true });
  vol.writeFileSync(`${DATA_DIR}/customers/acme/main_facts.md`, "---\nname: Acme\n---\n");
  const quote = await generateQuote(DATA_DIR, {
    slug: "acme",
    dealName: "Enterprise",
    lineItems: [{ description: "Seats", quantity: 10, unitPrice: 50 }],
    vatPercent: 19,
  });
  if (status !== "draft") {
    const { updateQuoteStatus } = await import("../../src/core/quote-generator.js");
    updateQuoteStatus(DATA_DIR, quote.quoteNumber, status as never);
  }
  return quote;
}

describe("quote token (sign/verify/expiry)", () => {
  it("round-trips a valid token", async () => {
    const { signQuoteToken, verifyQuoteToken } = await import("../../src/core/quote-link.js");
    const t = signQuoteToken({ q: "Q-2026-001", s: "acme", exp: Date.now() + 60_000 });
    expect(verifyQuoteToken(t)?.q).toBe("Q-2026-001");
  });

  it("rejects an expired token", async () => {
    const { signQuoteToken, verifyQuoteToken } = await import("../../src/core/quote-link.js");
    const t = signQuoteToken({ q: "Q-2026-001", s: "acme", exp: Date.now() - 1 });
    expect(verifyQuoteToken(t)).toBeNull();
  });

  it("rejects a tampered token", async () => {
    const { signQuoteToken, verifyQuoteToken } = await import("../../src/core/quote-link.js");
    const t = signQuoteToken({ q: "Q-2026-001", s: "acme", exp: Date.now() + 60_000 });
    expect(verifyQuoteToken(t.slice(0, -2) + "ZZ")).toBeNull();
  });
});

describe("renderQuotePage", () => {
  it("renders totals and accept/decline actions for an open quote", async () => {
    const quote = await seedQuote("sent");
    const { renderQuotePage } = await import("../../src/core/quote-link.js");
    const html = renderQuotePage(quote, "TOK");
    expect(html).toContain("595.00"); // 500 + 19%
    expect(html).toContain("/q/TOK/accept");
    expect(html).toContain("/q/TOK/decline");
  });

  it("XSS-escapes line item descriptions", async () => {
    const { generateQuote } = await import("../../src/core/quote-generator.js");
    vol.mkdirSync(`${DATA_DIR}/customers/acme`, { recursive: true });
    vol.writeFileSync(`${DATA_DIR}/customers/acme/main_facts.md`, "---\nname: A\n---\n");
    const quote = await generateQuote(DATA_DIR, {
      slug: "acme",
      dealName: "X",
      lineItems: [{ description: "<script>alert(1)</script>", quantity: 1, unitPrice: 1 }],
    });
    const { renderQuotePage } = await import("../../src/core/quote-link.js");
    const html = renderQuotePage(quote, "TOK");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows the settled status instead of forms once accepted", async () => {
    const quote = await seedQuote("accepted");
    const { renderQuotePage } = await import("../../src/core/quote-link.js");
    const { readQuote } = await import("../../src/core/quote-generator.js");
    const html = renderQuotePage(readQuote(DATA_DIR, quote.quoteNumber)!, "TOK");
    expect(html).toContain("accepted");
    expect(html).not.toContain("/accept");
  });
});

describe("acceptQuote / declineQuote / markQuotePaid", () => {
  it("accept stores status + signature receipt and emits quote.accepted", async () => {
    const quote = await seedQuote();
    const { acceptQuote } = await import("../../src/core/quote-link.js");
    const updated = await acceptQuote(DATA_DIR, quote.quoteNumber, {
      name: "Jane Buyer",
      ip: "203.0.113.7",
    });
    expect(updated?.status).toBe("accepted");
    expect(updated?.signature?.name).toBe("Jane Buyer");
    expect(updated?.signature?.ip).toBe("203.0.113.7");
    // signed receipt next to the quote
    const fs = (await import("fs")).default;
    const receipt = JSON.parse(
      fs.readFileSync(
        `${DATA_DIR}/.agentic/quotes/${quote.quoteNumber}.receipt.json`,
        "utf-8"
      ) as string
    ) as { name: string; signedAt: string };
    expect(receipt.name).toBe("Jane Buyer");
    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "quote.accepted",
      expect.objectContaining({ quoteNumber: quote.quoteNumber, signedBy: "Jane Buyer" })
    );
    expect(mockAppendInteraction).toHaveBeenCalled();
  });

  it("decline sets declinedAt and emits quote.declined", async () => {
    const quote = await seedQuote();
    const { declineQuote } = await import("../../src/core/quote-link.js");
    const updated = await declineQuote(DATA_DIR, quote.quoteNumber);
    expect(updated?.status).toBe("declined");
    expect(updated?.declinedAt).toBeDefined();
    expect(mockEmitEvent).toHaveBeenCalledWith(DATA_DIR, "quote.declined", expect.anything());
  });

  it("markQuotePaid sets paid + paidAt, emits quote.paid, and is idempotent", async () => {
    const quote = await seedQuote();
    const { markQuotePaid } = await import("../../src/core/quote-link.js");
    const updated = await markQuotePaid(DATA_DIR, quote.quoteNumber);
    expect(updated?.status).toBe("paid");
    expect(updated?.paidAt).toBeDefined();
    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "quote.paid",
      expect.objectContaining({ quoteNumber: quote.quoteNumber })
    );
    mockEmitEvent.mockClear();
    await markQuotePaid(DATA_DIR, quote.quoteNumber);
    expect(mockEmitEvent).not.toHaveBeenCalled(); // no double event
  });
});

describe("verifyStripeSignature", () => {
  it("accepts a correctly signed payload and rejects tampering", async () => {
    const { verifyStripeSignature } = await import("../../src/plugins/stripe.js");
    const { createHmac } = await import("node:crypto");
    const secret = "whsec_test";
    const body = JSON.stringify({ type: "checkout.session.completed" });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    expect(verifyStripeSignature(body, `t=${t},v1=${v1}`, secret)).toBe(true);
    expect(verifyStripeSignature(body + "x", `t=${t},v1=${v1}`, secret)).toBe(false);
    expect(verifyStripeSignature(body, undefined, secret)).toBe(false);
  });

  it("rejects stale timestamps (replay protection)", async () => {
    const { verifyStripeSignature } = await import("../../src/plugins/stripe.js");
    const { createHmac } = await import("node:crypto");
    const secret = "whsec_test";
    const body = "{}";
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const v1 = createHmac("sha256", secret).update(`${stale}.${body}`).digest("hex");
    expect(verifyStripeSignature(body, `t=${stale},v1=${v1}`, secret)).toBe(false);
  });
});

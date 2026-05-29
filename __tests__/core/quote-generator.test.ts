import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => { const { fs } = await import("memfs"); return { default: fs, ...fs }; });
vi.mock("@lancedb/lancedb", () => ({ connect: vi.fn().mockResolvedValue({ tableNames: vi.fn().mockResolvedValue([]) }) }));

const DATA_DIR = "/data";

const MAIN_FACTS = `---
name: Acme Corp
domain: acme.com
email: ceo@acme.com
relationship_stage: prospect
tags: []
currency: EUR
created: '2026-05-29'
updated: '2026-05-29'
last_touchpoint: 2026-05-29
---
`;

const QUOTE_CONFIG = `companyName: "Datasynx GmbH"
companyAddress: "Musterstr. 1, Berlin"
vatId: "DE123456789"
currency: EUR
paymentTerms: "Zahlungsziel 30 Tage"
footerText: "Alle Preise zzgl. MwSt."
`;

describe("generateQuote", () => {
  beforeEach(() => { vol.reset(); vi.resetModules(); });

  it("generates quote with correct quoteNumber Q-YYYY-001", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS,
      [`${DATA_DIR}/.agentic/quote-config.yaml`]: QUOTE_CONFIG,
    });
    const { generateQuote } = await import("../../src/core/quote-generator.js");
    const quote = await generateQuote(DATA_DIR, {
      slug: "acme",
      dealName: "Enterprise Deal",
      lineItems: [{ description: "Consulting", quantity: 1, unitPrice: 5000 }],
    });
    expect(quote.quoteNumber).toMatch(/^Q-\d{4}-001$/);
  });

  it("increments quote number sequentially", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS,
    });
    const { generateQuote } = await import("../../src/core/quote-generator.js");
    const q1 = await generateQuote(DATA_DIR, {
      slug: "acme",
      dealName: "Deal 1",
      lineItems: [{ description: "Item", quantity: 1, unitPrice: 1000 }],
    });
    const q2 = await generateQuote(DATA_DIR, {
      slug: "acme",
      dealName: "Deal 2",
      lineItems: [{ description: "Item", quantity: 1, unitPrice: 2000 }],
    });
    const num1 = parseInt(q1.quoteNumber.split("-")[2]!, 10);
    const num2 = parseInt(q2.quoteNumber.split("-")[2]!, 10);
    expect(num2).toBe(num1 + 1);
  });

  it("calculates subtotal, vat, and total correctly", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS });
    const { generateQuote } = await import("../../src/core/quote-generator.js");
    const quote = await generateQuote(DATA_DIR, {
      slug: "acme",
      dealName: "Test Deal",
      lineItems: [
        { description: "Consulting", quantity: 2, unitPrice: 1000 },
        { description: "Support", quantity: 12, unitPrice: 500 },
      ],
      vatPercent: 19,
    });
    expect(quote.subtotal).toBe(8000); // 2*1000 + 12*500
    expect(quote.vat).toBeCloseTo(1520, 1); // 8000 * 0.19
    expect(quote.total).toBeCloseTo(9520, 1);
  });

  it("writes JSON and HTML to .agentic/quotes/", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS });
    const { generateQuote } = await import("../../src/core/quote-generator.js");
    const quote = await generateQuote(DATA_DIR, {
      slug: "acme",
      dealName: "Test",
      lineItems: [{ description: "Item", quantity: 1, unitPrice: 100 }],
    });
    const files = Object.keys(vol.toJSON());
    expect(files.some((f) => f.includes(`${quote.quoteNumber}.json`))).toBe(true);
    expect(files.some((f) => f.includes(`${quote.quoteNumber}.html`))).toBe(true);
  });

  it("HTML contains company name from quote-config", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS,
      [`${DATA_DIR}/.agentic/quote-config.yaml`]: QUOTE_CONFIG,
    });
    const { generateQuote } = await import("../../src/core/quote-generator.js");
    const quote = await generateQuote(DATA_DIR, {
      slug: "acme",
      dealName: "Test",
      lineItems: [{ description: "Item", quantity: 1, unitPrice: 100 }],
    });
    const html = vol.toJSON()[quote.htmlPath!] as string;
    expect(html).toContain("Datasynx GmbH");
  });

  it("validUntil is createdAt + validUntilDays", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS });
    const { generateQuote } = await import("../../src/core/quote-generator.js");
    const quote = await generateQuote(DATA_DIR, {
      slug: "acme",
      dealName: "Test",
      lineItems: [{ description: "Item", quantity: 1, unitPrice: 100 }],
      validUntilDays: 30,
    });
    const created = new Date(quote.createdAt.slice(0, 10));
    const validUntil = new Date(quote.validUntil);
    const diff = Math.round((validUntil.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    expect(diff).toBe(30);
  });

  it("status defaults to draft", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS });
    const { generateQuote } = await import("../../src/core/quote-generator.js");
    const quote = await generateQuote(DATA_DIR, {
      slug: "acme",
      dealName: "Test",
      lineItems: [{ description: "Item", quantity: 1, unitPrice: 100 }],
    });
    expect(quote.status).toBe("draft");
  });

  it("updateQuoteStatus changes status and sets viewedAt", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS });
    const { generateQuote, updateQuoteStatus, readQuote } = await import("../../src/core/quote-generator.js");
    const quote = await generateQuote(DATA_DIR, {
      slug: "acme",
      dealName: "Test",
      lineItems: [{ description: "Item", quantity: 1, unitPrice: 100 }],
    });
    updateQuoteStatus(DATA_DIR, quote.quoteNumber, "viewed");
    const updated = readQuote(DATA_DIR, quote.quoteNumber);
    expect(updated?.status).toBe("viewed");
    expect(updated?.viewedAt).toBeDefined();
  });

  it("listQuotes filters by slug", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS });
    const { generateQuote, listQuotes } = await import("../../src/core/quote-generator.js");
    await generateQuote(DATA_DIR, { slug: "acme", dealName: "D1", lineItems: [{ description: "X", quantity: 1, unitPrice: 100 }] });
    await generateQuote(DATA_DIR, { slug: "beta", dealName: "D2", lineItems: [{ description: "Y", quantity: 1, unitPrice: 200 }] });
    expect(listQuotes(DATA_DIR, "acme")).toHaveLength(1);
    expect(listQuotes(DATA_DIR)).toHaveLength(2);
  });
});

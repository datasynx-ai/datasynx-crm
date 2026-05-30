import { describe, it, expect } from "vitest";
import { QuoteSchema, QuoteLineItemSchema } from "../../src/schemas/quote.js";

describe("QuoteLineItemSchema", () => {
  it("accepts valid line item", () => {
    const result = QuoteLineItemSchema.safeParse({ description: "Consulting", quantity: 2, unitPrice: 500, total: 1000 });
    expect(result.success).toBe(true);
  });

  it("rejects zero quantity", () => {
    expect(QuoteLineItemSchema.safeParse({ description: "X", quantity: 0, unitPrice: 100, total: 0 }).success).toBe(false);
  });

  it("rejects empty description", () => {
    expect(QuoteLineItemSchema.safeParse({ description: "", quantity: 1, unitPrice: 100, total: 100 }).success).toBe(false);
  });
});

describe("QuoteSchema", () => {
  const validQuote = {
    quoteNumber: "Q-2026-001",
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
    status: "draft",
  };

  it("accepts a valid quote", () => {
    const result = QuoteSchema.safeParse(validQuote);
    expect(result.success).toBe(true);
  });

  it("defaults currency to EUR", () => {
    const result = QuoteSchema.safeParse({ ...validQuote, currency: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.currency).toBe("EUR");
  });

  it("defaults status to draft", () => {
    const result = QuoteSchema.safeParse({ ...validQuote, status: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("draft");
  });

  it("defaults validUntilDays to 30", () => {
    const result = QuoteSchema.safeParse({ ...validQuote, validUntilDays: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.validUntilDays).toBe(30);
  });

  it("accepts optional viewedAt and acceptedAt", () => {
    const result = QuoteSchema.safeParse({
      ...validQuote,
      status: "accepted",
      viewedAt: "2026-06-01T08:00:00Z",
      acceptedAt: "2026-06-01T09:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid quoteNumber pattern", () => {
    expect(QuoteSchema.safeParse({ ...validQuote, quoteNumber: "Q-001" }).success).toBe(false);
    expect(QuoteSchema.safeParse({ ...validQuote, quoteNumber: "2026-001" }).success).toBe(false);
  });

  it("rejects empty lineItems", () => {
    expect(QuoteSchema.safeParse({ ...validQuote, lineItems: [] }).success).toBe(false);
  });

  it("rejects invalid status", () => {
    expect(QuoteSchema.safeParse({ ...validQuote, status: "expired" }).success).toBe(false);
  });
});

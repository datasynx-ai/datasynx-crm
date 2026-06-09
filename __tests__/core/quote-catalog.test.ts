import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/data";

beforeEach(() => {
  vol.reset();
  vol.mkdirSync(`${DATA_DIR}/customers/acme-corp`, { recursive: true });
  vol.writeFileSync(`${DATA_DIR}/customers/acme-corp/main_facts.md`, "---\nname: Acme\n---\n");
});

describe("generate_quote — catalog SKU integration (#50)", () => {
  it("resolves price/description/tax from the catalog by SKU", async () => {
    const { upsertProduct } = await import("../../src/fs/catalog-store.js");
    upsertProduct(DATA_DIR, {
      sku: "SEAT",
      name: "Pro Seat",
      unitPrice: 50,
      currency: "EUR",
      taxRate: 19,
      createdAt: "2026-06-09T00:00:00.000Z",
    });

    const { generateQuote } = await import("../../src/core/quote-generator.js");
    const quote = await generateQuote(DATA_DIR, {
      slug: "acme-corp",
      dealName: "Expansion",
      lineItems: [{ sku: "SEAT", quantity: 10 }],
    });

    expect(quote.lineItems[0]!.description).toBe("Pro Seat");
    expect(quote.lineItems[0]!.unitPrice).toBe(50);
    expect(quote.lineItems[0]!.total).toBe(500);
    expect(quote.subtotal).toBe(500);
    expect(quote.vatPercent).toBe(19); // taken from the catalog
    expect(quote.vat).toBe(95);
    expect(quote.total).toBe(595);
  });

  it("still supports free ad-hoc line items", async () => {
    const { generateQuote } = await import("../../src/core/quote-generator.js");
    const quote = await generateQuote(DATA_DIR, {
      slug: "acme-corp",
      dealName: "Custom",
      lineItems: [{ description: "Custom integration", quantity: 1, unitPrice: 2000 }],
      vatPercent: 0,
    });
    expect(quote.lineItems[0]!.description).toBe("Custom integration");
    expect(quote.subtotal).toBe(2000);
    expect(quote.total).toBe(2000);
  });

  it("mixes catalog + ad-hoc items in one quote", async () => {
    const { upsertProduct } = await import("../../src/fs/catalog-store.js");
    upsertProduct(DATA_DIR, {
      sku: "SEAT",
      name: "Pro Seat",
      unitPrice: 50,
      currency: "EUR",
      taxRate: 19,
      createdAt: "2026-06-09T00:00:00.000Z",
    });
    const { generateQuote } = await import("../../src/core/quote-generator.js");
    const quote = await generateQuote(DATA_DIR, {
      slug: "acme-corp",
      dealName: "Mixed",
      lineItems: [
        { sku: "SEAT", quantity: 2 },
        { description: "Onboarding", quantity: 1, unitPrice: 300 },
      ],
    });
    expect(quote.subtotal).toBe(400);
  });

  it("rejects an unknown SKU", async () => {
    const { generateQuote } = await import("../../src/core/quote-generator.js");
    await expect(
      generateQuote(DATA_DIR, {
        slug: "acme-corp",
        dealName: "X",
        lineItems: [{ sku: "GHOST", quantity: 1 }],
      })
    ).rejects.toThrow(/Unknown product SKU/);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import {
  listProducts,
  getProduct,
  upsertProduct,
  deleteProduct,
} from "../../src/fs/catalog-store.js";
import type { Product } from "../../src/schemas/product.js";

const DATA_DIR = "/data";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    sku: "SEAT",
    name: "Pro Seat",
    unitPrice: 49,
    currency: "EUR",
    taxRate: 19,
    createdAt: "2026-06-09T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => vol.reset());

describe("catalog-store", () => {
  it("returns [] when empty", () => {
    expect(listProducts(DATA_DIR)).toEqual([]);
  });

  it("upserts (create then update) by SKU", () => {
    upsertProduct(DATA_DIR, makeProduct());
    expect(listProducts(DATA_DIR)).toHaveLength(1);
    upsertProduct(DATA_DIR, makeProduct({ unitPrice: 59 }));
    const all = listProducts(DATA_DIR);
    expect(all).toHaveLength(1);
    expect(all[0]!.unitPrice).toBe(59);
    expect(getProduct(DATA_DIR, "SEAT")?.unitPrice).toBe(59);
  });

  it("deletes by SKU", () => {
    upsertProduct(DATA_DIR, makeProduct());
    expect(deleteProduct(DATA_DIR, "SEAT")).toBe(true);
    expect(deleteProduct(DATA_DIR, "SEAT")).toBe(false);
    expect(listProducts(DATA_DIR)).toEqual([]);
  });
});

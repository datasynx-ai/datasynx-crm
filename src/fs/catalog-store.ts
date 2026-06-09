import path from "path";
import { readJsonArray, writeJsonArray } from "./json-store.js";
import { ProductSchema, type Product } from "../schemas/product.js";

/** Product/price catalog (#50), stored as `.agentic/catalog.json`. */
function catalogPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "catalog.json");
}

export function listProducts(dataDir: string): Product[] {
  return readJsonArray<Product>(catalogPath(dataDir), "products")
    .map((p) => ProductSchema.safeParse(p))
    .flatMap((r) => (r.success ? [r.data] : []));
}

export function getProduct(dataDir: string, sku: string): Product | undefined {
  return listProducts(dataDir).find((p) => p.sku === sku);
}

/** Create or update a product (upsert by SKU). Returns the stored product. */
export function upsertProduct(dataDir: string, product: Product): Product {
  const parsed = ProductSchema.parse(product);
  const all = listProducts(dataDir);
  const idx = all.findIndex((p) => p.sku === parsed.sku);
  if (idx >= 0) all[idx] = parsed;
  else all.push(parsed);
  writeJsonArray(catalogPath(dataDir), "products", all);
  return parsed;
}

export function deleteProduct(dataDir: string, sku: string): boolean {
  const all = listProducts(dataDir);
  const next = all.filter((p) => p.sku !== sku);
  if (next.length === all.length) return false;
  writeJsonArray(catalogPath(dataDir), "products", next);
  return true;
}

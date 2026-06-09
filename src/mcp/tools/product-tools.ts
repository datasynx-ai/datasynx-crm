import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listProducts, getProduct, upsertProduct } from "../../fs/catalog-store.js";
import { enforceRbac } from "../../core/rbac.js";
import { writeAuditEntry, getActor } from "../../fs/audit-log.js";
import type { Product } from "../../schemas/product.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

function ok(obj: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}
function fail(err: unknown): { content: Array<{ type: "text"; text: string }> } {
  return ok({ success: false, error: (err as Error).message });
}

// ─── create_product ───────────────────────────────────────────────────────────

export async function handleCreateProduct(
  input: {
    sku: string;
    name: string;
    unitPrice: number;
    currency?: string;
    taxRate?: number;
    recurring?: "monthly" | "yearly";
    description?: string;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    enforceRbac(dataDir, "create_product");
    const existing = getProduct(dataDir, input.sku);
    const product: Product = {
      sku: input.sku,
      name: input.name,
      unitPrice: input.unitPrice,
      currency: input.currency ?? "EUR",
      ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
      ...(input.recurring !== undefined ? { recurring: input.recurring } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const saved = upsertProduct(dataDir, product);
    writeAuditEntry(dataDir, {
      timestamp: new Date().toISOString(),
      actor: getActor(),
      tool: "create_product",
      slug: "-",
      summary: `${saved.sku} ${saved.name}`,
    });
    return ok({ success: true, product: saved });
  } catch (err) {
    return fail(err);
  }
}

export function registerCreateProduct(server: McpServer): void {
  server.registerTool(
    "create_product",
    {
      title: "Create Product",
      description: `Create or update a catalog product (upsert by SKU) so quotes can reference it
by SKU instead of re-typing prices (#50).

Returns: { success, product }`,
      inputSchema: z.object({
        sku: z.string().describe("Unique stock-keeping unit"),
        name: z.string().describe("Product name (used as quote line description)"),
        unitPrice: z.number().min(0).describe("Net unit price"),
        currency: z.string().optional().describe("Default: EUR"),
        taxRate: z.number().min(0).max(100).optional().describe("VAT %, e.g. 19"),
        recurring: z.enum(["monthly", "yearly"]).optional().describe("Subscription cadence"),
        description: z.string().optional(),
      }),
    },
    async (input) =>
      handleCreateProduct({
        sku: input.sku,
        name: input.name,
        unitPrice: input.unitPrice,
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
        ...(input.recurring !== undefined ? { recurring: input.recurring } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      })
  );
}

// ─── list_products ─────────────────────────────────────────────────────────────

export async function handleListProducts(
  _input: Record<string, never>,
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const products = listProducts(dataDir);
    return ok({ count: products.length, products });
  } catch (err) {
    return fail(err);
  }
}

export function registerListProducts(server: McpServer): void {
  server.registerTool(
    "list_products",
    {
      title: "List Products",
      description: `List all catalog products (SKU, name, price, tax, recurring) for quotes (#50).

Returns: { count, products }`,
      inputSchema: z.object({}),
    },
    async () => handleListProducts({})
  );
}

// ─── update_product ─────────────────────────────────────────────────────────────

export async function handleUpdateProduct(
  input: {
    sku: string;
    name?: string;
    unitPrice?: number;
    currency?: string;
    taxRate?: number;
    recurring?: "monthly" | "yearly";
    description?: string;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    enforceRbac(dataDir, "update_product");
    const existing = getProduct(dataDir, input.sku);
    if (!existing) {
      return ok({ success: false, error: `Product '${input.sku}' not found` });
    }
    const updated: Product = {
      ...existing,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
      ...(input.recurring !== undefined ? { recurring: input.recurring } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      updatedAt: new Date().toISOString(),
    };
    const saved = upsertProduct(dataDir, updated);
    return ok({ success: true, product: saved });
  } catch (err) {
    return fail(err);
  }
}

export function registerUpdateProduct(server: McpServer): void {
  server.registerTool(
    "update_product",
    {
      title: "Update Product",
      description: `Update fields of an existing catalog product by SKU (#50).

Returns: { success, product } or { success: false, error } when the SKU is unknown.`,
      inputSchema: z.object({
        sku: z.string().describe("SKU of the product to update"),
        name: z.string().optional(),
        unitPrice: z.number().min(0).optional(),
        currency: z.string().optional(),
        taxRate: z.number().min(0).max(100).optional(),
        recurring: z.enum(["monthly", "yearly"]).optional(),
        description: z.string().optional(),
      }),
    },
    async (input) =>
      handleUpdateProduct({
        sku: input.sku,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
        ...(input.recurring !== undefined ? { recurring: input.recurring } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      })
  );
}

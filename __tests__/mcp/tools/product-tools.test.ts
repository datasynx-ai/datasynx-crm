import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";

const DATA_DIR = "/data";

beforeEach(() => {
  vol.reset();
  vol.mkdirSync(`${DATA_DIR}/.agentic`, { recursive: true });
});

function parse(res: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
}

describe("create_product / list_products / update_product (#50, #69)", () => {
  it("creates a product with EUR default and lists it", async () => {
    const { handleCreateProduct, handleListProducts } =
      await import("../../../src/mcp/tools/product-tools.js");
    const created = parse(
      await handleCreateProduct({ sku: "SEAT", name: "Seat License", unitPrice: 49 }, DATA_DIR)
    );
    expect(created["success"]).toBe(true);
    expect(created["product"]).toMatchObject({ sku: "SEAT", currency: "EUR", unitPrice: 49 });

    const listed = parse(await handleListProducts({}, DATA_DIR));
    expect(listed["count"]).toBe(1);
  });

  it("upserts by SKU and keeps the original createdAt", async () => {
    const { handleCreateProduct } = await import("../../../src/mcp/tools/product-tools.js");
    const first = parse(
      await handleCreateProduct({ sku: "SEAT", name: "Seat", unitPrice: 49 }, DATA_DIR)
    )["product"] as { createdAt: string };
    const second = parse(
      await handleCreateProduct(
        { sku: "SEAT", name: "Seat v2", unitPrice: 59, taxRate: 19, recurring: "monthly" },
        DATA_DIR
      )
    )["product"] as { createdAt: string; name: string; recurring: string };
    expect(second.name).toBe("Seat v2");
    expect(second.recurring).toBe("monthly");
    expect(second.createdAt).toBe(first.createdAt);
  });

  it("update patches fields and reports unknown SKUs", async () => {
    const { handleCreateProduct, handleUpdateProduct } =
      await import("../../../src/mcp/tools/product-tools.js");
    await handleCreateProduct({ sku: "SEAT", name: "Seat", unitPrice: 49 }, DATA_DIR);
    const updated = parse(
      await handleUpdateProduct({ sku: "SEAT", unitPrice: 79, description: "annual" }, DATA_DIR)
    );
    expect(updated["success"]).toBe(true);
    expect(updated["product"]).toMatchObject({
      unitPrice: 79,
      description: "annual",
      name: "Seat",
    });

    const missing = parse(await handleUpdateProduct({ sku: "NOPE", unitPrice: 1 }, DATA_DIR));
    expect(missing["success"]).toBe(false);
    expect(String(missing["error"])).toContain("NOPE");
  });

  it("enforces RBAC: a rep cannot create products", async () => {
    vol.writeFileSync(
      `${DATA_DIR}/.agentic/rbac.json`,
      JSON.stringify({ actors: { carol: "rep" } })
    );
    process.env["DXCRM_ACTOR"] = "carol";
    try {
      const { handleCreateProduct } = await import("../../../src/mcp/tools/product-tools.js");
      const res = parse(await handleCreateProduct({ sku: "X", name: "X", unitPrice: 1 }, DATA_DIR));
      expect(res["success"]).toBe(false);
    } finally {
      delete process.env["DXCRM_ACTOR"];
    }
  });
});

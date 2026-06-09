import { Command } from "commander";
import { success, error, info, bold } from "../ui/colors.js";
import { listProducts, getProduct, upsertProduct } from "../fs/catalog-store.js";
import type { Product } from "../schemas/product.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const productCommand = new Command("product").description(
  "Reusable product & price catalog for quotes"
);

productCommand
  .command("add <sku>")
  .description("Add or update a catalog product")
  .requiredOption("--name <name>", "Product name")
  .requiredOption("--price <price>", "Net unit price")
  .option("--currency <currency>", "Currency", "EUR")
  .option("--tax <rate>", "Tax/VAT rate in %")
  .option("--recurring <cadence>", "monthly | yearly")
  .option("--description <text>", "Description")
  .action(
    (
      sku: string,
      opts: {
        name: string;
        price: string;
        currency: string;
        tax?: string;
        recurring?: string;
        description?: string;
      }
    ) => {
      const existing = getProduct(dataDir(), sku);
      const recurring =
        opts.recurring === "monthly" || opts.recurring === "yearly" ? opts.recurring : undefined;
      const product: Product = {
        sku,
        name: opts.name,
        unitPrice: parseFloat(opts.price),
        currency: opts.currency,
        ...(opts.tax !== undefined ? { taxRate: parseFloat(opts.tax) } : {}),
        ...(recurring ? { recurring } : {}),
        ...(opts.description ? { description: opts.description } : {}),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (isNaN(product.unitPrice)) {
        console.error(error("--price must be a number"));
        process.exit(1);
      }
      upsertProduct(dataDir(), product);
      console.log(success(`✓ Product '${sku}' saved — ${product.unitPrice} ${product.currency}`));
    }
  );

productCommand
  .command("list")
  .description("List catalog products")
  .action(() => {
    const products = listProducts(dataDir());
    if (products.length === 0) {
      console.log(info("No products in the catalog. Add one with 'dxcrm product add'."));
      return;
    }
    for (const p of products) {
      const tax = p.taxRate !== undefined ? ` +${p.taxRate}% tax` : "";
      const rec = p.recurring ? ` (${p.recurring})` : "";
      console.log(`  ${bold(p.sku)}  ${p.name}  ${p.unitPrice} ${p.currency}${tax}${rec}`);
    }
  });

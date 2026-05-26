import { Command } from "commander";
import fs from "fs";
import path from "path";
import { readMainFacts } from "../fs/customer-dir.js";
import { renderCustomerTable } from "../ui/table.js";

export const listCommand = new Command("list")
  .option("--filter <query>", "Filter by name or slug")
  .action(async (opts: { filter?: string }) => {
    const dataDir = process.cwd();
    const customersDir = path.join(dataDir, "customers");

    if (!fs.existsSync(customersDir)) {
      console.log("No customers yet. Run: dxcrm create \"Customer Name\"");
      return;
    }

    const slugs = fs
      .readdirSync(customersDir)
      .filter((s) => fs.statSync(path.join(customersDir, s)).isDirectory());

    const customers: Array<{
      slug: string;
      facts: import("../schemas/main-facts.js").MainFacts;
    }> = [];

    for (const slug of slugs) {
      try {
        const facts = await readMainFacts(dataDir, slug);
        if (opts.filter) {
          const q = opts.filter.toLowerCase();
          if (
            !facts.name.toLowerCase().includes(q) &&
            !slug.includes(q) &&
            !(facts.relationship_stage ?? "").toLowerCase().includes(q)
          ) continue;
        }
        customers.push({ slug, facts });
      } catch {
        /* skip invalid */
      }
    }

    if (customers.length === 0) {
      console.log(
        opts.filter ? `No customers matching "${opts.filter}"` : "No customers yet."
      );
      return;
    }

    console.log(renderCustomerTable(customers));
  });

import { Command } from "commander";
import { readMainFacts, listCustomerSlugs } from "../fs/customer-dir.js";
import { renderCustomerTable } from "../ui/table.js";
import type { MainFacts } from "../schemas/main-facts.js";

export const listCommand = new Command("list")
  .description("List all customers")
  .option("--filter <query>", "Filter by name or slug")
  .action(async (opts: { filter?: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const slugs = listCustomerSlugs(dataDir);

    if (slugs.length === 0) {
      console.log('No customers yet. Run: dxcrm create "Customer Name"');
      return;
    }

    const customers: Array<{
      slug: string;
      facts: MainFacts;
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
          )
            continue;
        }
        customers.push({ slug, facts });
      } catch {
        /* skip invalid */
      }
    }

    if (customers.length === 0) {
      console.log(opts.filter ? `No customers matching "${opts.filter}"` : "No customers yet.");
      return;
    }

    console.log(renderCustomerTable(customers));
  });

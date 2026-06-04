import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { customerVisibility } from "../../core/rbac.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export interface CustomerSummary {
  slug: string;
  name: string;
  stage: string;
  lastInteraction?: string | undefined;
  dealValue?: number | undefined;
}

function extractLastInteractionDate(interactionsPath: string): string | undefined {
  if (!fs.existsSync(interactionsPath)) return undefined;

  const content = fs.readFileSync(interactionsPath, "utf-8") as string;
  // Match first ## YYYY-MM-DD heading
  const match = /^## (\d{4}-\d{2}-\d{2})/m.exec(content);
  return match ? match[1] : undefined;
}

export async function handleListCustomers(
  input: { filter?: string },
  dataDir: string = DATA_DIR
): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const customersDir = path.join(dataDir, "customers");
  const customers: CustomerSummary[] = [];

  if (!fs.existsSync(customersDir)) {
    return {
      content: [{ type: "text", text: JSON.stringify([], null, 2) }],
    };
  }

  const entries = fs.readdirSync(customersDir) as string[];

  // Resolve RBAC visibility once (reads rbac.json a single time, not per customer).
  const actor = process.env["DXCRM_ACTOR"] ?? "system";
  const canSee = customerVisibility(dataDir, actor);

  for (const entry of entries) {
    const customerDir = path.join(customersDir, entry);

    // Skip if not a directory
    try {
      const stat = fs.statSync(customerDir);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    const mainFactsPath = path.join(customerDir, "main_facts.md");
    if (!fs.existsSync(mainFactsPath)) continue;

    try {
      const raw = matter(fs.readFileSync(mainFactsPath, "utf-8") as string);
      const data = raw.data as Record<string, unknown>;

      const name = typeof data["name"] === "string" ? data["name"] : entry;
      const stage =
        typeof data["relationship_stage"] === "string" ? data["relationship_stage"] : "unknown";
      const dealValue = typeof data["deal_value"] === "number" ? data["deal_value"] : undefined;

      const lastInteraction = extractLastInteractionDate(path.join(customerDir, "interactions.md"));

      const summary: CustomerSummary = {
        slug: entry,
        name,
        stage,
        ...(lastInteraction !== undefined ? { lastInteraction } : {}),
        ...(dealValue !== undefined ? { dealValue } : {}),
      };

      // Apply filter if provided (name, slug, or stage)
      if (input.filter) {
        const filterLower = input.filter.toLowerCase();
        const matches =
          name.toLowerCase().includes(filterLower) ||
          entry.toLowerCase().includes(filterLower) ||
          stage.toLowerCase().includes(filterLower);
        if (!matches) continue;
      }

      // RBAC data-visibility: rep role only sees owned customers
      if (!canSee(entry)) continue;

      customers.push(summary);
    } catch {
      // Skip customers with malformed data
      continue;
    }
  }

  return {
    content: [{ type: "text", text: JSON.stringify(customers, null, 2) }],
  };
}

export function registerListCustomers(server: McpServer): void {
  server.registerTool(
    "list_customers",
    {
      title: "List Customers",
      description: `List all customers with their pipeline stage, last interaction date, and deal value.
Useful for morning briefings and pipeline overviews.

Args:
  filter: Optional substring to filter by name or slug (case-insensitive)

Returns: Array of { slug, name, stage, lastInteraction?, dealValue? }`,
      inputSchema: z.object({
        filter: z
          .string()
          .optional()
          .describe("Substring filter on customer name or slug (case-insensitive)"),
      }),
    },
    async ({ filter }) => handleListCustomers({ ...(filter !== undefined ? { filter } : {}) })
  );
}

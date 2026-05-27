import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchAcrossCustomers, type CrossCustomerResult } from "../../core/cross-customer.js";
import fs from "fs";
import path from "path";

const DATA_DIR = process.cwd();

export async function handleGetMarketIntelligence(
  input: { query: string; excludeCurrentCustomer?: boolean; slug?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const excludeSlug = input.excludeCurrentCustomer ? input.slug : undefined;

  // Count total customers before excluding
  const customersDir = path.join(dataDir, "customers");
  let totalCustomersSearched = 0;
  if (fs.existsSync(customersDir)) {
    const all = fs.readdirSync(customersDir).filter((d) =>
      fs.statSync(path.join(customersDir, d)).isDirectory()
    );
    totalCustomersSearched = excludeSlug
      ? all.filter((s) => s !== excludeSlug).length
      : all.length;
  }

  const results: CrossCustomerResult[] = await searchAcrossCustomers(
    dataDir,
    input.query,
    10,
    excludeSlug
  );

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { query: input.query, results, totalCustomersSearched },
          null,
          2
        ),
      },
    ],
  };
}

export function registerGetMarketIntelligence(server: McpServer): void {
  server.registerTool(
    "get_market_intelligence",
    {
      title: "Get Market Intelligence",
      description:
        "Search across all customers to find patterns, common topics, or similar issues. Uses semantic search (LanceDB) across all customer knowledge bases. Results use slug (not real names) for privacy.",
      inputSchema: z.object({
        query: z.string().describe("What to search for across all customers"),
        excludeCurrentCustomer: z
          .boolean()
          .optional()
          .describe("Exclude the current customer from results"),
        slug: z.string().optional().describe("Current customer slug (used with excludeCurrentCustomer)"),
      }),
    },
    async ({ query, excludeCurrentCustomer, slug }) =>
      handleGetMarketIntelligence({
        query,
        ...(excludeCurrentCustomer !== undefined ? { excludeCurrentCustomer } : {}),
        ...(slug !== undefined ? { slug } : {}),
      })
  );
}

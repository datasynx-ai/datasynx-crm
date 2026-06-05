import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchKnowledge } from "../../core/lancedb.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleSearchCustomerKnowledge(
  input: { slug: string; query: string; limit?: number },
  dataDir: string = DATA_DIR
): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const limit = input.limit ?? 5;

  try {
    const results = await searchKnowledge(dataDir, input.slug, input.query, limit);

    const response =
      results.length === 0
        ? {
            results: [],
            message:
              `No results found for "${input.query}" in customer "${input.slug}". ` +
              "The customer may not have been synced yet. Run dxcrm sync to index emails and transcripts.",
          }
        : { results };

    return {
      content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
    };
  } catch {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            results: [],
            message: `Search unavailable for customer "${input.slug}". LanceDB may not be initialized.`,
          }),
        },
      ],
    };
  }
}

export function registerSearchCustomerKnowledge(server: McpServer): void {
  server.registerTool(
    "search_customer_knowledge",
    {
      title: "Search Customer Knowledge",
      description: `Hybrid search across all emails and transcripts for a customer: a semantic
vector leg (embeddings ANN) and a keyword leg (BM25 full-text) are fused via Reciprocal Rank
Fusion. Vector finds semantically similar content; full-text nails exact terms, IDs and names.
Use when you need to find specific information from past communications.

Args:
  slug: Customer ID (e.g. "acme-corp")
  query: Natural language search query (e.g. "pricing discussion", "GDPR concerns")
  limit: Max results to return (default 5)

Returns: { results: Array<{ content, score, source }> }
If no results: returns empty array with a helpful sync suggestion.`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug (e.g. 'acme-corp')"),
        query: z.string().describe("Search query (natural language or keywords)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max results to return (default 5)"),
      }),
    },
    async ({ slug, query, limit }) =>
      handleSearchCustomerKnowledge({
        slug,
        query,
        ...(limit !== undefined ? { limit } : {}),
      })
  );
}

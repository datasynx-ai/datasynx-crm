import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readQuote, listQuotes } from "../../core/quote-generator.js";

const DATA_DIR = process.cwd();

export async function handleGetQuoteStatus(
  input: { quoteNumber?: string; slug?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  if (input.quoteNumber) {
    const quote = readQuote(dataDir, input.quoteNumber);
    if (!quote) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `Quote '${input.quoteNumber}' not found` }) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(quote, null, 2) }] };
  }

  const quotes = listQuotes(dataDir, input.slug);
  return { content: [{ type: "text", text: JSON.stringify({ quotes }, null, 2) }] };
}

export function registerGetQuoteStatus(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "get_quote_status",
    {
      description: `Get quote status and details. Filter by quoteNumber (single quote) or slug (all quotes for a customer).
Returns quote with status: draft | sent | viewed | accepted | declined`,
      inputSchema: z.object({
        quoteNumber: z.string().optional().describe("Specific quote number (e.g. Q-2026-001)"),
        slug: z.string().optional().describe("Customer slug to list all quotes for"),
      }),
    },
    ({ quoteNumber, slug }) =>
      handleGetQuoteStatus(
        {
          ...(quoteNumber !== undefined ? { quoteNumber } : {}),
          ...(slug !== undefined ? { slug } : {}),
        },
        dataDir
      )
  );
}

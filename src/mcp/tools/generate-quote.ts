import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateQuote } from "../../core/quote-generator.js";

const DATA_DIR = process.cwd();

export async function handleGenerateQuote(
  input: {
    slug: string;
    dealName: string;
    lineItems: Array<{ description: string; quantity: number; unitPrice: number }>;
    vatPercent?: number;
    validUntilDays?: number;
    currency?: string;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const quote = await generateQuote(dataDir, input);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          quoteNumber: quote.quoteNumber,
          htmlPath: quote.htmlPath,
          total: quote.total,
          subtotal: quote.subtotal,
          vat: quote.vat,
          vatPercent: quote.vatPercent,
          currency: quote.currency,
          validUntil: quote.validUntil,
          status: quote.status,
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: (err as Error).message }) }],
    };
  }
}

export function registerGenerateQuote(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "generate_quote",
    {
      description: `Generate a professional HTML quote/offer for a customer deal.
Calculates subtotal, VAT, and total. Saves JSON + HTML to .agentic/quotes/.
Returns: { quoteNumber, htmlPath, total, currency, validUntil }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        dealName: z.string().describe("Name of the deal this quote is for"),
        lineItems: z.array(z.object({
          description: z.string(),
          quantity: z.number().positive(),
          unitPrice: z.number().min(0),
        })).min(1).describe("Line items for the quote"),
        vatPercent: z.number().min(0).max(100).optional().describe("VAT percentage (default 19)"),
        validUntilDays: z.number().int().positive().optional().describe("Quote validity in days (default 30)"),
        currency: z.string().optional().describe("Currency code (default EUR)"),
      }),
    },
    ({ slug, dealName, lineItems, vatPercent, validUntilDays, currency }) =>
      handleGenerateQuote({
        slug,
        dealName,
        lineItems,
        ...(vatPercent !== undefined ? { vatPercent } : {}),
        ...(validUntilDays !== undefined ? { validUntilDays } : {}),
        ...(currency !== undefined ? { currency } : {}),
      }, dataDir)
  );
}

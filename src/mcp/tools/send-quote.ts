import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readQuote, updateQuoteStatus, quoteFilePath } from "../../core/quote-generator.js";
import { buildQuoteLink } from "../../core/quote-link.js";
import { writeFileAtomic } from "../../fs/atomic-write.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleSendQuote(
  input: { slug: string; quoteNumber: string; validDays?: number },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const quote = readQuote(dataDir, input.quoteNumber);
    if (!quote || quote.slug !== input.slug) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: `Quote '${input.quoteNumber}' not found for '${input.slug}'`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Optional Stripe payment link — only when the API key is configured
    // (env or vault, #72).
    const { resolveSecret } = await import("../../core/secrets.js");
    const stripeKey = resolveSecret(dataDir, "STRIPE_API_KEY");
    let paymentLinkUrl = quote.paymentLinkUrl;
    if (stripeKey && !paymentLinkUrl) {
      const { createStripePaymentLink } = await import("../../plugins/stripe.js");
      paymentLinkUrl =
        (await createStripePaymentLink(stripeKey, {
          amount: quote.total,
          currency: quote.currency,
          quoteNumber: quote.quoteNumber,
          description: `${quote.dealName} (${quote.quoteNumber})`,
        })) ?? undefined;
      if (paymentLinkUrl) {
        writeFileAtomic(
          quoteFilePath(dataDir, quote.quoteNumber),
          JSON.stringify({ ...quote, paymentLinkUrl }, null, 2)
        );
      }
    }

    if (quote.status === "draft") updateQuoteStatus(dataDir, quote.quoteNumber, "sent");
    const link = buildQuoteLink(quote, input.validDays ?? quote.validUntilDays);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              quoteNumber: quote.quoteNumber,
              link,
              ...(paymentLinkUrl ? { paymentLinkUrl } : {}),
              expiresInDays: input.validDays ?? quote.validUntilDays,
              status: quote.status === "draft" ? "sent" : quote.status,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2),
        },
      ],
    };
  }
}

export function registerSendQuote(server: McpServer): void {
  server.registerTool(
    "send_quote",
    {
      title: "Send Quote",
      description: `Mint the public, token-secured quote link (#49): the recipient can view the
quote and accept (with a lightweight e-signature: name + timestamp + IP) or
decline online. When STRIPE_API_KEY is set, a Stripe payment link is attached so
acceptance can flow straight into payment (webhook → quote.paid event).
Tokens are HMAC-signed and expire.

Returns: { success, quoteNumber, link, paymentLinkUrl?, expiresInDays, status }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        quoteNumber: z.string().describe("Quote number (e.g. Q-2026-001)"),
        validDays: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Link validity (default: quote's validUntilDays)"),
      }),
    },
    async ({ slug, quoteNumber, validDays }) =>
      handleSendQuote({
        slug,
        quoteNumber,
        ...(validDays !== undefined ? { validDays } : {}),
      })
  );
}

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildPortalLink } from "../../core/portal.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleGetPortalLink(
  input: { slug: string; contactEmail: string; validDays?: number },
  _dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const days = input.validDays ?? 30;
  const link = buildPortalLink(input.slug, input.contactEmail, days);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { link, slug: input.slug, contactEmail: input.contactEmail, expiresInDays: days },
          null,
          2
        ),
      },
    ],
  };
}

export function registerGetPortalLink(server: McpServer): void {
  server.registerTool(
    "get_portal_link",
    {
      title: "Get Portal Link",
      description: `Mint a magic link to the customer self-service portal (#58): the contact
sees their own tickets, opens new ones, replies, and searches the PUBLIC
knowledge base. Access is strictly scoped to that customer via the HMAC-signed,
expiring token. Portal actions create the usual ticket events/interactions
(auto-routing #59 applies; replies fire ticket.replied for workflows).

Returns: { link, slug, contactEmail, expiresInDays }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        contactEmail: z.string().email().describe("Contact the link is issued to"),
        validDays: z.number().int().positive().optional().describe("Default 30"),
      }),
    },
    async ({ slug, contactEmail, validDays }) =>
      handleGetPortalLink({
        slug,
        contactEmail,
        ...(validDays !== undefined ? { validDays } : {}),
      })
  );
}

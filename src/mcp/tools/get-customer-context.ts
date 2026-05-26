import path from "path";
import fs from "fs";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildContext } from "../../core/context-builder.js";
import { getSession } from "../../core/session-store.js";
import { getLastGmailSync, updateSlugSyncState } from "../../fs/sync-state.js";
import { getGmailAuth } from "../../core/oauth-store.js";

const DATA_DIR = process.cwd();

export async function handleGetCustomerContext(
  input: { slug?: string },
  dataDir: string = DATA_DIR
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  const targetSlug = input.slug ?? getSession()?.customerSlug;

  if (!targetSlug) {
    return {
      content: [
        {
          type: "text",
          text: "No customer specified and no active session. Use: get_customer_context({ slug: 'acme-corp' })",
        },
      ],
      isError: true,
    };
  }

  // Fire-and-forget On-Query-Sync
  const auth = getGmailAuth();
  if (auth) {
    const lastSync = getLastGmailSync(dataDir, targetSlug);
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    if (!lastSync || lastSync < thirtyMinAgo) {
      const sourcesPath = path.join(dataDir, "customers", targetSlug, "sources.json");
      if (fs.existsSync(sourcesPath)) {
        try {
          const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf-8")) as {
            gmail?: { query?: string; enabled?: boolean };
          };
          if (sources.gmail?.enabled && sources.gmail.query) {
            const { syncGmail } = await import("../../sync/gmail-sync.js");
            void syncGmail({ slug: targetSlug, dataDir, auth, query: sources.gmail.query })
              .then(() =>
                updateSlugSyncState(dataDir, targetSlug, {
                  lastGmailSync: new Date().toISOString(),
                })
              )
              .catch(() => {});
          }
        } catch {
          // non-critical
        }
      }
    }
  }

  try {
    const context = await buildContext(dataDir, targetSlug);
    return {
      content: [{ type: "text", text: context }],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${(err as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

export function registerGetCustomerContext(server: McpServer): void {
  server.registerTool(
    "get_customer_context",
    {
      title: "Get Customer Context",
      description: `Returns a complete, LLM-ready context block for a customer.
Use this before any customer-related conversation or action.

Args:
  slug: Customer ID (e.g. "acme-corp"). Leave empty to use active session customer.

Returns: Structured markdown with Quick Reference, Contacts, Critical Context,
Recent Activity (last 10 interactions), Pipeline, and Open Questions.

Performance: <3 seconds. Token budget: <3000.`,
      inputSchema: z.object({
        slug: z
          .string()
          .optional()
          .describe(
            "Customer slug (e.g. 'acme-corp'). Leave empty for active session customer."
          ),
      }),
    },
    async ({ slug }) =>
      handleGetCustomerContext({ ...(slug !== undefined ? { slug } : {}) })
  );
}

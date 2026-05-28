import path from "path";
import fs from "fs";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildContext } from "../../core/context-builder.js";
import { getSession } from "../../core/session-store.js";
import { getLastGmailSync, updateSlugSyncState } from "../../fs/sync-state.js";
import { getGmailAuth } from "../../core/oauth-store.js";
import { canSeeCustomer } from "../../core/rbac.js";

const DATA_DIR = process.cwd();

function triggerOnQuerySync(dataDir: string, slug: string): void {
  const auth = getGmailAuth();
  if (!auth) return;

  const lastSync = getLastGmailSync(dataDir, slug);
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  if (lastSync && lastSync >= thirtyMinAgo) return;

  const sourcesPath = path.join(dataDir, "customers", slug, "sources.json");
  if (!fs.existsSync(sourcesPath)) return;

  try {
    const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf-8") as string) as {
      gmail?: { query?: string; enabled?: boolean };
    };
    if (!sources.gmail?.enabled || !sources.gmail.query) return;

    const query = sources.gmail.query;
    void import("../../sync/gmail-sync.js")
      .then(({ syncGmail }) =>
        syncGmail({ slug, dataDir, auth, query })
          .then(() => updateSlugSyncState(dataDir, slug, { lastGmailSync: new Date().toISOString() }))
          .catch(() => {})
      )
      .catch(() => {});
  } catch {
    // non-critical
  }
}

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

  // RBAC data-visibility: rep role only sees owned customers
  const actor = process.env["DXCRM_ACTOR"] ?? "system";
  if (!canSeeCustomer(dataDir, actor, targetSlug)) {
    return {
      content: [{ type: "text", text: `Access denied: '${actor}' cannot view customer '${targetSlug}'.` }],
      isError: true,
    };
  }

  // Fire-and-forget on-query sync — does not block context return
  triggerOnQuerySync(dataDir, targetSlug);

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
Automatically triggers a background Gmail sync if last sync was >30 minutes ago.

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

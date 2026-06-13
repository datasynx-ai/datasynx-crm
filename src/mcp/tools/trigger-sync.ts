import path from "path";
import fs from "fs";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGmailAuth } from "../../core/oauth-store.js";
import { updateSlugSyncState } from "../../fs/sync-state.js";

const DATA_DIR = process.cwd();

export async function handleTriggerSync(
  input: { slug?: string; since?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const auth = getGmailAuth();
  if (!auth) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "Gmail auth not configured. Run `dxcrm mailbox login gmail` first.",
          }),
        },
      ],
    };
  }

  const customersDir = path.join(dataDir, "customers");
  if (!fs.existsSync(customersDir)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, synced: 0, skipped: 0, customers: [] }),
        },
      ],
    };
  }

  const slugs = input.slug
    ? [input.slug]
    : fs.readdirSync(customersDir).filter((s) => {
        try {
          return fs.statSync(path.join(customersDir, s)).isDirectory();
        } catch {
          return false;
        }
      });

  const sinceDate = input.since
    ? new Date(input.since)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const results: Array<{ slug: string; synced: number; skipped: number }> = [];
  const errors: string[] = [];

  for (const slug of slugs) {
    const sourcesPath = path.join(customersDir, slug, "sources.json");
    if (!fs.existsSync(sourcesPath)) continue;
    try {
      const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf-8") as string) as {
        gmail?: { query?: string; enabled?: boolean };
      };
      if (!sources.gmail?.enabled || !sources.gmail.query) continue;

      const { syncGmail } = await import("../../sync/gmail-sync.js");
      const result = await syncGmail({
        slug,
        dataDir,
        auth,
        query: sources.gmail.query,
        since: sinceDate,
      });
      updateSlugSyncState(dataDir, slug, { lastGmailSync: new Date().toISOString() });
      results.push({ slug, ...result });
    } catch (err) {
      errors.push(`${slug}: ${(err as Error).message}`);
    }
  }

  const total = results.reduce(
    (acc, r) => ({ synced: acc.synced + r.synced, skipped: acc.skipped + r.skipped }),
    { synced: 0, skipped: 0 }
  );

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            ...total,
            customers: results,
            errors,
          },
          null,
          2
        ),
      },
    ],
  };
}

export function registerTriggerSync(server: McpServer): void {
  server.registerTool(
    "trigger_sync",
    {
      title: "Trigger Sync",
      description: `Immediately trigger a Gmail sync for one or all customers.
Use when you need fresh email data before answering a question.
The background daemon syncs every 30 minutes automatically — this forces an immediate sync.

Args:
  slug: Customer slug to sync (leave empty to sync all customers)
  since: ISO date string — only fetch emails since this date (default: last 24 hours)

Returns: { success: boolean, synced: number, skipped: number, customers: [...], errors: [...] }`,
      inputSchema: z.object({
        slug: z.string().optional().describe("Customer slug to sync (empty = all customers)"),
        since: z
          .string()
          .optional()
          .describe("Sync emails since this ISO date (default: last 24h)"),
      }),
    },
    async ({ slug, since }) => {
      const input: { slug?: string; since?: string } = {};
      if (slug !== undefined) input.slug = slug;
      if (since !== undefined) input.since = since;
      return handleTriggerSync(input);
    }
  );
}

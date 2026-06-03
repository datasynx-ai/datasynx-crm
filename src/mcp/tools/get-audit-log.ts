import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readAuditLog, filterAuditLog } from "../../fs/audit-log.js";

const DATA_DIR = process.cwd();

export async function handleGetAuditLog(
  input: { slug?: string; actor?: string; limit?: number },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const entries = readAuditLog(dataDir);
  const filterOpts: { slug?: string; actor?: string; limit?: number } = {
    limit: input.limit ?? 50,
  };
  if (input.slug !== undefined) filterOpts.slug = input.slug;
  if (input.actor !== undefined) filterOpts.actor = input.actor;
  const filtered = filterAuditLog(entries, filterOpts);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            total: entries.length,
            returned: filtered.length,
            entries: filtered,
          },
          null,
          2
        ),
      },
    ],
  };
}

export function registerGetAuditLog(server: McpServer): void {
  server.registerTool(
    "get_audit_log",
    {
      title: "Get Audit Log",
      description: `Read the CRM audit log — all write operations with timestamp, actor, tool, and customer.
Use to answer "what changed recently?", "what did alice do?", or "show me all actions for acme-corp".

Args:
  slug: Filter by customer slug (optional)
  actor: Filter by actor name (optional)
  limit: Max entries to return (default: 50, most recent)

Returns: { total: number, returned: number, entries: [{timestamp, actor, tool, slug, summary}] }`,
      inputSchema: z.object({
        slug: z.string().optional().describe("Filter by customer slug"),
        actor: z.string().optional().describe("Filter by actor (user or system)"),
        limit: z.number().int().min(1).max(500).optional().describe("Max entries (default 50)"),
      }),
    },
    async ({ slug, actor, limit }) => {
      const input: { slug?: string; actor?: string; limit?: number } = {};
      if (slug !== undefined) input.slug = slug;
      if (actor !== undefined) input.actor = actor;
      if (limit !== undefined) input.limit = limit;
      return handleGetAuditLog(input);
    }
  );
}

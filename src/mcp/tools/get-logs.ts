import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { queryLogs, summarizeLogs, type LogLevel } from "../../core/logger.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleGetLogs(
  input: {
    level?: LogLevel;
    component?: string;
    since?: string;
    contains?: string;
    limit?: number;
    summary?: boolean;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const query = {
    ...(input.level !== undefined ? { level: input.level } : {}),
    ...(input.component !== undefined ? { component: input.component } : {}),
    ...(input.since !== undefined ? { since: input.since } : {}),
    ...(input.contains !== undefined ? { contains: input.contains } : {}),
    limit: input.limit ?? 100,
  };

  const payload = input.summary
    ? summarizeLogs(dataDir, query)
    : (() => {
        const entries = queryLogs(dataDir, query);
        return { returned: entries.length, entries };
      })();

  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

export function registerGetLogs(server: McpServer): void {
  server.registerTool(
    "get_logs",
    {
      title: "Get Logs",
      description: `Read and analyze the structured application log (.agentic/logs.ndjson).
Use to answer "what went wrong recently?", "show errors from gmail sync", or "summarize today's activity".

Args:
  level: Minimum level to include — debug | info | warn | error (optional)
  component: Filter by component, e.g. "gmail-sync", "lancedb" (optional)
  since: ISO timestamp; only entries at or after it (optional)
  contains: Case-insensitive substring of the message (optional)
  limit: Max entries to return (default 100, most recent)
  summary: When true, return aggregated counts (by level + component) and recent errors instead of raw entries

Returns (entries): { returned: number, entries: [{ts, level, component, message, context?}] }
Returns (summary): { total, byLevel, byComponent, firstTs, lastTs, recentErrors }`,
      inputSchema: z.object({
        level: z.enum(["debug", "info", "warn", "error"]).optional().describe("Minimum level"),
        component: z.string().optional().describe("Filter by component"),
        since: z.string().optional().describe("ISO timestamp lower bound"),
        contains: z.string().optional().describe("Message substring filter"),
        limit: z.number().int().min(1).max(1000).optional().describe("Max entries (default 100)"),
        summary: z.boolean().optional().describe("Return aggregated summary instead of entries"),
      }),
    },
    async ({ level, component, since, contains, limit, summary }) => {
      const input: Parameters<typeof handleGetLogs>[0] = {};
      if (level !== undefined) input.level = level;
      if (component !== undefined) input.component = component;
      if (since !== undefined) input.since = since;
      if (contains !== undefined) input.contains = contains;
      if (limit !== undefined) input.limit = limit;
      if (summary !== undefined) input.summary = summary;
      return handleGetLogs(input);
    }
  );
}

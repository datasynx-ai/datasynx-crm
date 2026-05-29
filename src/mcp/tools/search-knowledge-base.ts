import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchKbSimple, getKbMetaForExport } from "../../fs/knowledge-base.js";

const DATA_DIR = process.cwd();

export async function handleSearchKnowledgeBase(
  input: { query: string; category?: string; publicOnly?: boolean; limit?: number },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const results = searchKbSimple(dataDir, input.query, {
    ...(input.publicOnly ? { publicOnly: true } : {}),
  });

  const filtered = input.category ? results.filter((a) => a.category === input.category) : results;
  const limited = filtered.slice(0, input.limit ?? 10);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        query: input.query,
        count: limited.length,
        articles: limited.map((a) => ({
          ...getKbMetaForExport(a),
          excerpt: a.body.slice(0, 300).trim(),
        })),
      }, null, 2),
    }],
  };
}

export function registerSearchKnowledgeBase(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "search_knowledge_base",
    {
      description: `Search the knowledge base for articles. Text search on title, body, and tags.
Returns: { count, articles[] } with excerpts`,
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        category: z.string().optional().describe("Filter by category (e.g. 'troubleshooting', 'howto')"),
        publicOnly: z.boolean().optional().describe("Only return public articles"),
        limit: z.number().int().positive().optional().describe("Max results (default 10)"),
      }),
    },
    ({ query, category, publicOnly, limit }) =>
      handleSearchKnowledgeBase(
        {
          query,
          ...(category !== undefined ? { category } : {}),
          ...(publicOnly !== undefined ? { publicOnly } : {}),
          ...(limit !== undefined ? { limit } : {}),
        },
        dataDir
      )
  );
}

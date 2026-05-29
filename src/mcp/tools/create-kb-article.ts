import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeKbArticle, getKbArticle } from "../../fs/knowledge-base.js";
import type { KbArticle } from "../../schemas/kb-article.js";

const DATA_DIR = process.cwd();

export async function handleCreateKbArticle(
  input: {
    id: string;
    title: string;
    body: string;
    category?: string;
    tags?: string[];
    public?: boolean;
    sourceTicketId?: string;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const existing = getKbArticle(dataDir, input.id);
  if (existing) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: `Article '${input.id}' already exists` }) }],
    };
  }

  const now = new Date().toISOString();
  const article: KbArticle = {
    id: input.id,
    title: input.title,
    body: input.body,
    category: input.category ?? "general",
    tags: input.tags ?? [],
    public: input.public ?? false,
    createdAt: now,
    updatedAt: now,
    ...(input.sourceTicketId ? { sourceTicketId: input.sourceTicketId } : {}),
  };

  writeKbArticle(dataDir, article);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        id: article.id,
        title: article.title,
        category: article.category,
        path: `.agentic/knowledge-base/${article.category}/${article.id}.md`,
      }, null, 2),
    }],
  };
}

export function registerCreateKbArticle(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "create_kb_article",
    {
      description: `Create a new knowledge base article. Articles are stored as Markdown files in .agentic/knowledge-base/.
Returns: { id, title, category, path }`,
      inputSchema: z.object({
        id: z.string().min(1).describe("Article ID (slug, e.g. 'troubleshoot-api-timeout')"),
        title: z.string().min(1).describe("Article title"),
        body: z.string().min(1).describe("Article body in Markdown"),
        category: z.string().optional().describe("Category (default: 'general')"),
        tags: z.array(z.string()).optional().describe("Tags for search"),
        public: z.boolean().optional().describe("Make article publicly accessible (default: false)"),
        sourceTicketId: z.string().optional().describe("Ticket ID this article was created from"),
      }),
    },
    ({ id, title, body, category, tags, public: pub, sourceTicketId }) =>
      handleCreateKbArticle(
        {
          id,
          title,
          body,
          ...(category !== undefined ? { category } : {}),
          ...(tags !== undefined ? { tags } : {}),
          ...(pub !== undefined ? { public: pub } : {}),
          ...(sourceTicketId !== undefined ? { sourceTicketId } : {}),
        },
        dataDir
      )
  );
}

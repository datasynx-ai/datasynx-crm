import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listTemplates } from "../../fs/template-store.js";

const DATA_DIR = process.cwd();

export async function handleListEmailTemplates(
  input: { category?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const templates = listTemplates(dataDir, input.category ? { category: input.category } : {});
  const summary = templates.map(({ body: _body, ...meta }) => meta);
  return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
}

export function registerListEmailTemplates(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "list_email_templates",
    {
      description: "List available email templates. Optionally filter by category (e.g. 'outreach', 'followup', 'support').",
      inputSchema: z.object({
        category: z.string().optional().describe("Filter by category"),
      }),
    },
    ({ category }) => handleListEmailTemplates(category ? { category } : {}, dataDir)
  );
}

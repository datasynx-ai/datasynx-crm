import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listPlaybooks } from "../../core/playbooks.js";

const DATA_DIR = process.cwd();

export async function handleListPlaybooks(
  input: { slug: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const playbooks = listPlaybooks(dataDir, input.slug);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          playbooks: playbooks.map((pb) => ({
            name: pb.name,
            trigger: pb.frontmatter.trigger,
            successRate: pb.frontmatter.successRate,
            usedCount: pb.frontmatter.usedCount,
            lastUpdated: pb.frontmatter.lastUpdated,
          })),
          count: playbooks.length,
          slug: input.slug,
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2) }],
    };
  }
}

export function registerListPlaybooks(server: McpServer): void {
  server.registerTool(
    "list_playbooks",
    {
      title: "List Playbooks",
      description: `List all playbooks for a customer (metadata only, no body content).

Use to discover available playbooks before calling get_playbook with deal context.

Args:
  slug: Customer ID

Returns: { playbooks: [{ name, trigger, successRate, usedCount, lastUpdated }], count, slug }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer ID"),
      }),
    },
    async ({ slug }) => handleListPlaybooks({ slug }, DATA_DIR)
  );
}

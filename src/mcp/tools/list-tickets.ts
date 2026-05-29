import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listAllTickets } from "../../fs/ticket-writer.js";
import type { Ticket } from "../../schemas/ticket.js";

const DATA_DIR = process.cwd();

export async function handleListTickets(
  input: { slug?: string; status?: Ticket["status"]; priority?: Ticket["priority"]; assignee?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const results = await listAllTickets(dataDir, {
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.assignee !== undefined ? { assignee: input.assignee } : {}),
  });

  return {
    content: [{ type: "text", text: JSON.stringify({ tickets: results }, null, 2) }],
  };
}

export function registerListTickets(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "list_tickets",
    {
      description: `List support tickets. Filter by customer, status, priority, or assignee. Sorted by priority then date.
Returns: { tickets: Array<{ slug, ticket }> }`,
      inputSchema: z.object({
        slug: z.string().optional().describe("Filter by customer slug"),
        status: z.enum(["open", "in-progress", "waiting", "resolved", "closed"]).optional(),
        priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
        assignee: z.string().optional().describe("Filter by assignee"),
      }),
    },
    ({ slug, status, priority, assignee }) =>
      handleListTickets(
        {
          ...(slug !== undefined ? { slug } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(assignee !== undefined ? { assignee } : {}),
        },
        dataDir
      )
  );
}

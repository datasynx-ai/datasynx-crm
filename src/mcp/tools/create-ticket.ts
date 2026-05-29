import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readTickets, upsertTicket, nextTicketId } from "../../fs/ticket-writer.js";
import { calcSlaDue, loadSlaRules } from "../../core/sla-engine.js";
import type { Ticket } from "../../schemas/ticket.js";

const DATA_DIR = process.cwd();

export async function handleCreateTicket(
  input: { slug: string; title: string; description?: string; priority?: Ticket["priority"]; assignee?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const today = new Date().toISOString().slice(0, 10);
  const rules = loadSlaRules(dataDir);
  const priority = input.priority ?? "normal";
  const existing = await readTickets(dataDir, input.slug);
  const id = nextTicketId(existing);
  const slaDue = calcSlaDue(today, priority, rules);

  const ticket: Ticket = {
    id,
    title: input.title,
    status: "open",
    priority,
    ...(input.assignee ? { assignee: input.assignee } : {}),
    created: today,
    slaDue,
    ...(input.description ? { description: input.description } : {}),
  };

  await upsertTicket(dataDir, input.slug, ticket);

  return {
    content: [{ type: "text", text: JSON.stringify({ ticket }, null, 2) }],
  };
}

export function registerCreateTicket(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "create_ticket",
    {
      description: `Create a support ticket for a customer. Auto-calculates SLA due date based on priority.
Returns: { ticket } with id T-NNN, status=open, slaDue`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        title: z.string().min(1).describe("Ticket title"),
        description: z.string().optional().describe("Detailed description"),
        priority: z.enum(["urgent", "high", "normal", "low"]).optional().describe("Priority (default: normal)"),
        assignee: z.string().optional().describe("Assignee name or email"),
      }),
    },
    ({ slug, title, description, priority, assignee }) =>
      handleCreateTicket(
        {
          slug,
          title,
          ...(description !== undefined ? { description } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(assignee !== undefined ? { assignee } : {}),
        },
        dataDir
      )
  );
}

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readTickets, upsertTicket } from "../../fs/ticket-writer.js";
import type { Ticket } from "../../schemas/ticket.js";

const DATA_DIR = process.cwd();

export async function handleUpdateTicket(
  input: { slug: string; ticketId: string; status?: Ticket["status"]; assignee?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tickets = await readTickets(dataDir, input.slug);
  const ticket = tickets.find((t) => t.id === input.ticketId);

  if (!ticket) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: `Ticket '${input.ticketId}' not found for customer '${input.slug}'` }) }],
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const updated: Ticket = {
    ...ticket,
    ...(input.status ? { status: input.status } : {}),
    ...(input.assignee !== undefined ? { assignee: input.assignee } : {}),
    ...(input.status === "resolved" && !ticket.resolved ? { resolved: today } : {}),
  };

  await upsertTicket(dataDir, input.slug, updated);

  return {
    content: [{ type: "text", text: JSON.stringify({ ticket: updated }, null, 2) }],
  };
}

export function registerUpdateTicket(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "update_ticket",
    {
      description: `Update a ticket's status or assignee. Setting status=resolved auto-sets resolved date.
Returns: { ticket }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        ticketId: z.string().describe("Ticket ID (e.g. T-001)"),
        status: z.enum(["open", "in-progress", "waiting", "resolved", "closed"]).optional(),
        assignee: z.string().optional().describe("New assignee"),
      }),
    },
    ({ slug, ticketId, status, assignee }) =>
      handleUpdateTicket(
        {
          slug,
          ticketId,
          ...(status !== undefined ? { status } : {}),
          ...(assignee !== undefined ? { assignee } : {}),
        },
        dataDir
      )
  );
}

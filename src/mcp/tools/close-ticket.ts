import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readTickets, upsertTicket } from "../../fs/ticket-writer.js";
import { appendInteraction } from "../../fs/interactions-writer.js";
import type { Ticket } from "../../schemas/ticket.js";

const DATA_DIR = process.cwd();

export async function handleCloseTicket(
  input: { slug: string; ticketId: string; resolution?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tickets = await readTickets(dataDir, input.slug);
  const ticket = tickets.find((t) => t.id === input.ticketId);

  if (!ticket) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: `Ticket '${input.ticketId}' not found for '${input.slug}'` }) }],
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const updated: Ticket = {
    ...ticket,
    status: "closed",
    resolved: ticket.resolved ?? today,
  };

  await upsertTicket(dataDir, input.slug, updated);

  if (input.resolution) {
    await appendInteraction(dataDir, input.slug, {
      date: today,
      type: "Note",
      with: input.slug,
      summary: `Ticket ${input.ticketId} closed: ${input.resolution}`,
      nextSteps: [],
      sourceRef: `ticket://${input.ticketId}/close`,
      synced: new Date().toISOString(),
    });
  }

  return {
    content: [{ type: "text", text: JSON.stringify({ ticket: updated }, null, 2) }],
  };
}

export function registerCloseTicket(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "close_ticket",
    {
      description: `Close a support ticket. Optionally logs the resolution as an interaction.
Returns: { ticket } with status=closed`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        ticketId: z.string().describe("Ticket ID (e.g. T-001)"),
        resolution: z.string().optional().describe("Resolution notes (logged as interaction)"),
      }),
    },
    ({ slug, ticketId, resolution }) =>
      handleCloseTicket(
        {
          slug,
          ticketId,
          ...(resolution !== undefined ? { resolution } : {}),
        },
        dataDir
      )
  );
}

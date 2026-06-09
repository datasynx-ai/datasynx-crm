import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readTickets, upsertTicket, nextTicketId } from "../../fs/ticket-writer.js";
import { calcSlaDue, loadSlaRules } from "../../core/sla-engine.js";
import type { Ticket } from "../../schemas/ticket.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleCreateTicket(
  input: {
    slug: string;
    title: string;
    description?: string;
    priority?: Ticket["priority"];
    assignee?: string;
    tags?: string[];
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const today = new Date().toISOString().slice(0, 10);
  const rules = loadSlaRules(dataDir);
  const priority = input.priority ?? "normal";
  const existing = await readTickets(dataDir, input.slug);
  const id = nextTicketId(existing);
  const slaDue = calcSlaDue(today, priority, rules);

  // Skills-based auto-routing (#59): when no assignee is given, resolve one
  // from the routing rules (customer/priority/tag → assignee|skill|round-robin).
  let assignee = input.assignee;
  let autoRouted = false;
  if (!assignee) {
    const { resolveAssignee } = await import("../../core/ticket-routing.js");
    const routed = resolveAssignee(dataDir, {
      slug: input.slug,
      priority,
      ...(input.tags ? { tags: input.tags } : {}),
    });
    if (routed) {
      assignee = routed;
      autoRouted = true;
    }
  }

  const ticket: Ticket = {
    id,
    title: input.title,
    status: "open",
    priority,
    ...(assignee ? { assignee } : {}),
    created: today,
    slaDue,
    ...(input.description ? { description: input.description } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
  };

  await upsertTicket(dataDir, input.slug, ticket);

  if (autoRouted) {
    const { writeAuditEntry } = await import("../../fs/audit-log.js");
    writeAuditEntry(dataDir, {
      timestamp: new Date().toISOString(),
      actor: "router",
      tool: "ticket_auto_route",
      slug: input.slug,
      summary: `${ticket.id} auto-routed → ${assignee}`,
    });
  }

  // Event for outbound webhooks + workflow automation (#48).
  {
    const { emitEvent } = await import("../../core/webhooks.js");
    await emitEvent(dataDir, "ticket.created", { slug: input.slug, ticket }).catch(() => undefined);
  }

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
        tags: z.array(z.string()).optional().describe("Routing tags, e.g. ['billing']"),
        priority: z
          .enum(["urgent", "high", "normal", "low"])
          .optional()
          .describe("Priority (default: normal)"),
        assignee: z.string().optional().describe("Assignee name or email"),
      }),
    },
    ({ slug, title, description, priority, assignee, tags }) =>
      handleCreateTicket(
        {
          slug,
          title,
          ...(description !== undefined ? { description } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(assignee !== undefined ? { assignee } : {}),
          ...(tags !== undefined ? { tags } : {}),
        },
        dataDir
      )
  );
}

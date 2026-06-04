import { readTickets, upsertTicket, nextTicketId } from "../fs/ticket-writer.js";
import { calcSlaDue, loadSlaRules } from "./sla-engine.js";
import { loadRoutingAgents, routeTicket } from "./routing.js";
import type { Ticket, TicketPriority } from "../schemas/ticket.js";

/**
 * Transfer-to-human / escalation (N3-2): stop autonomous handling and hand a
 * customer issue to a person by opening a prioritized ticket, auto-assigned via
 * the routing engine when agents are configured.
 */
export async function escalateToHuman(
  dataDir: string,
  slug: string,
  reason: string,
  priority: TicketPriority = "high",
  skill?: string
): Promise<Ticket> {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await readTickets(dataDir, slug);
  const assignee = routeTicket(loadRoutingAgents(dataDir), skill ? { skill } : {});

  const ticket: Ticket = {
    id: nextTicketId(existing),
    title: `Escalation: ${reason}`,
    status: "open",
    priority,
    created: today,
    slaDue: calcSlaDue(today, priority, loadSlaRules(dataDir)),
    description: `Transferred to human. Reason: ${reason}`,
    ...(assignee ? { assignee } : {}),
  };

  await upsertTicket(dataDir, slug, ticket);
  return ticket;
}

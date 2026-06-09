import fs from "fs";
import path from "path";
import { TicketSchema, type Ticket } from "../schemas/ticket.js";
import { listCustomerSlugs, assertSafeSlug } from "./customer-dir.js";
import { writeFileAtomic } from "./atomic-write.js";

const TICKET_HEADER = "# Tickets\n\n";
const TABLE_HEADER = `| ID | Title | Status | Priority | Assignee | Created | SLA Due | Resolved | Tags | Warned | Escalated |
|----|-------|--------|----------|----------|---------|---------|---------|------|--------|-----------|`;

function ticketsPath(dataDir: string, slug: string): string {
  assertSafeSlug(slug);
  return path.join(dataDir, "customers", slug, "tickets.md");
}

function escapeMd(s: string | undefined): string {
  return (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function parseTicketsFromMarkdown(content: string): Ticket[] {
  const tickets: Ticket[] = [];
  const lines = content.split("\n");
  let inTable = false;

  for (const line of lines) {
    if (line.startsWith("| ID |") || line.startsWith("|----")) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith("|")) {
      inTable = false;
      continue;
    }

    const cols = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cols.length < 8) continue;
    // Columns 9-11 (tags, slaWarnedAt, escalatedAt) are optional (#59) so files
    // written before the routing/SLA feature keep parsing.
    const [
      id,
      title,
      status,
      priority,
      assignee,
      created,
      slaDue,
      resolved,
      tags,
      warned,
      escalated,
    ] = cols;
    if (!id || !title || id === "ID") continue;

    const raw = {
      id,
      title,
      status: status || "open",
      priority: priority || "normal",
      ...(assignee ? { assignee } : {}),
      created: created || new Date().toISOString().slice(0, 10),
      ...(slaDue ? { slaDue } : {}),
      ...(resolved ? { resolved } : {}),
      ...(tags
        ? {
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          }
        : {}),
      ...(warned ? { slaWarnedAt: warned } : {}),
      ...(escalated ? { escalatedAt: escalated } : {}),
    };

    const parsed = TicketSchema.safeParse(raw);
    if (parsed.success) tickets.push(parsed.data);
  }
  return tickets;
}

function serializeTickets(tickets: Ticket[]): string {
  const rows = tickets.map(
    (t) =>
      `| ${t.id} | ${escapeMd(t.title)} | ${t.status} | ${t.priority} | ${t.assignee ?? ""} | ${t.created} | ${t.slaDue ?? ""} | ${t.resolved ?? ""} | ${(t.tags ?? []).join(",")} | ${t.slaWarnedAt ?? ""} | ${t.escalatedAt ?? ""} |`
  );
  return `${TICKET_HEADER}${TABLE_HEADER}\n${rows.join("\n")}\n`;
}

export async function readTickets(dataDir: string, slug: string): Promise<Ticket[]> {
  const p = ticketsPath(dataDir, slug);
  if (!fs.existsSync(p)) return [];
  return parseTicketsFromMarkdown(fs.readFileSync(p, "utf-8") as string);
}

export async function upsertTicket(dataDir: string, slug: string, ticket: Ticket): Promise<void> {
  const p = ticketsPath(dataDir, slug);
  const existing = await readTickets(dataDir, slug);
  const idx = existing.findIndex((t) => t.id === ticket.id);
  if (idx >= 0) {
    existing[idx] = ticket;
  } else {
    existing.push(ticket);
  }
  writeFileAtomic(p, serializeTickets(existing));
}

export function nextTicketId(tickets: Ticket[]): string {
  const nums = tickets.map((t) => parseInt(t.id.replace("T-", ""), 10)).filter((n) => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `T-${String(max + 1).padStart(3, "0")}`;
}

export async function listAllTickets(
  dataDir: string,
  filter?: { slug?: string; status?: string; priority?: string; assignee?: string }
): Promise<Array<{ slug: string; ticket: Ticket }>> {
  const slugs = filter?.slug ? [filter.slug] : listCustomerSlugs(dataDir);

  // Each customer's tickets file is independent — read them in parallel.
  const perCustomer = await Promise.all(
    slugs.map(async (slug) => {
      const tickets = await readTickets(dataDir, slug);
      return tickets
        .filter(
          (ticket) =>
            (!filter?.status || ticket.status === filter.status) &&
            (!filter?.priority || ticket.priority === filter.priority) &&
            (!filter?.assignee || ticket.assignee === filter.assignee)
        )
        .map((ticket) => ({ slug, ticket }));
    })
  );
  const results = perCustomer.flat();

  // Sort: urgent first, then by created date
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  results.sort((a, b) => {
    const pa = priorityOrder[a.ticket.priority] ?? 2;
    const pb = priorityOrder[b.ticket.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return a.ticket.created.localeCompare(b.ticket.created);
  });

  return results;
}

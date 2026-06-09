import { Command } from "commander";
import { success, error, info, bold } from "../ui/colors.js";
import { readTickets, listAllTickets, nextTicketId, upsertTicket } from "../fs/ticket-writer.js";
import { calcSlaDue, loadSlaRules } from "../core/sla-engine.js";
import type { Ticket } from "../schemas/ticket.js";

export const ticketCommand = new Command("ticket").description("Manage support tickets");

ticketCommand
  .command("list")
  .description("List tickets")
  .option("--slug <slug>", "Filter by customer slug")
  .option("--status <status>", "Filter by status")
  .option("--priority <priority>", "Filter by priority")
  .action(async (opts: { slug?: string; status?: string; priority?: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const tickets = await listAllTickets(dataDir, {
      ...(opts.slug ? { slug: opts.slug } : {}),
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.priority ? { priority: opts.priority } : {}),
    });

    if (tickets.length === 0) {
      console.log(info("No tickets found."));
      return;
    }

    for (const { slug, ticket: t } of tickets) {
      const breach =
        t.slaDue &&
        t.slaDue < new Date().toISOString().slice(0, 10) &&
        t.status !== "resolved" &&
        t.status !== "closed";
      const flag = breach ? " ⚠ SLA" : "";
      console.log(
        `  ${bold(t.id)}  [${slug}]  ${t.title}  [${t.status}/${t.priority}]${t.assignee ? `  @${t.assignee}` : ""}${flag}`
      );
    }
  });

ticketCommand
  .command("create <slug>")
  .description("Create a ticket for a customer")
  .requiredOption("--title <title>", "Ticket title")
  .option("--description <desc>", "Description")
  .option("--priority <priority>", "Priority: urgent|high|normal|low", "normal")
  .option("--assignee <name>", "Assignee")
  .action(
    async (
      slug: string,
      opts: { title: string; description?: string; priority: string; assignee?: string }
    ) => {
      const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
      const today = new Date().toISOString().slice(0, 10);
      const rules = loadSlaRules(dataDir);
      const priority = (opts.priority as Ticket["priority"]) ?? "normal";
      const existing = await readTickets(dataDir, slug);
      const id = nextTicketId(existing);

      const ticket: Ticket = {
        id,
        title: opts.title,
        status: "open",
        priority,
        ...(opts.assignee ? { assignee: opts.assignee } : {}),
        created: today,
        slaDue: calcSlaDue(today, priority, rules),
        ...(opts.description ? { description: opts.description } : {}),
      };

      await upsertTicket(dataDir, slug, ticket);
      console.log(success(`✓ Ticket ${bold(id)} created for ${slug}`));
      console.log(info(`  SLA due: ${ticket.slaDue}`));
    }
  );

ticketCommand
  .command("update <ticketId>")
  .description("Update a ticket")
  .requiredOption("--slug <slug>", "Customer slug")
  .option("--status <status>", "New status")
  .option("--assignee <name>", "New assignee")
  .action(async (ticketId: string, opts: { slug: string; status?: string; assignee?: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const tickets = await readTickets(dataDir, opts.slug);
    const ticket = tickets.find((t) => t.id === ticketId);

    if (!ticket) {
      console.error(error(`Ticket '${ticketId}' not found`));
      process.exit(1);
    }

    const today = new Date().toISOString().slice(0, 10);
    const updated: Ticket = {
      ...ticket,
      ...(opts.status ? { status: opts.status as Ticket["status"] } : {}),
      ...(opts.assignee !== undefined ? { assignee: opts.assignee } : {}),
      ...(opts.status === "resolved" && !ticket.resolved ? { resolved: today } : {}),
    };

    await upsertTicket(dataDir, opts.slug, updated);
    console.log(success(`✓ Ticket ${bold(ticketId)} updated`));
  });

ticketCommand
  .command("close <ticketId>")
  .description("Close a ticket")
  .requiredOption("--slug <slug>", "Customer slug")
  .option("--resolution <text>", "Resolution notes")
  .action(async (ticketId: string, opts: { slug: string; resolution?: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const tickets = await readTickets(dataDir, opts.slug);
    const ticket = tickets.find((t) => t.id === ticketId);

    if (!ticket) {
      console.error(error(`Ticket '${ticketId}' not found`));
      process.exit(1);
    }

    const today = new Date().toISOString().slice(0, 10);
    const updated: Ticket = { ...ticket, status: "closed", resolved: ticket.resolved ?? today };
    await upsertTicket(dataDir, opts.slug, updated);
    console.log(success(`✓ Ticket ${bold(ticketId)} closed`));
  });

ticketCommand
  .command("route-rules")
  .description("List ticket routing rules (#59)")
  .action(async () => {
    const { loadRoutingRules } = await import("../core/ticket-routing.js");
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const rules = loadRoutingRules(dataDir);
    if (rules.length === 0) {
      console.log("No routing rules. Add one with 'dxcrm ticket route-rules-add'.");
      return;
    }
    for (const r of rules) {
      const match =
        Object.entries(r.match)
          .map(([k, v]) => `${k}=${v}`)
          .join(",") || "*";
      const assign =
        r.assign.assignee ?? (r.assign.skill ? `skill:${r.assign.skill}` : "round-robin");
      console.log(`  ${r.id}  match[${match}] → ${assign}`);
    }
  });

ticketCommand
  .command("route-rules-add")
  .description("Add a routing rule (first matching rule wins)")
  .option("--slug <slug>", "Match customer slug")
  .option("--priority <p>", "Match priority (urgent|high|normal|low)")
  .option("--tag <tag>", "Match ticket tag")
  .option("--assignee <name>", "Assign directly to this actor")
  .option("--skill <skill>", "Route to an available agent with this skill")
  .option("--round-robin", "Route to the least-loaded available agent")
  .action(
    async (opts: {
      slug?: string;
      priority?: string;
      tag?: string;
      assignee?: string;
      skill?: string;
      roundRobin?: boolean;
    }) => {
      const { addRoutingRule } = await import("../core/ticket-routing.js");
      const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
      const rule = addRoutingRule(dataDir, {
        match: {
          ...(opts.slug ? { slug: opts.slug } : {}),
          ...(opts.priority ? { priority: opts.priority } : {}),
          ...(opts.tag ? { tag: opts.tag } : {}),
        },
        assign: opts.assignee
          ? { assignee: opts.assignee }
          : opts.skill
            ? { skill: opts.skill }
            : { roundRobin: true },
      });
      console.log(`Rule ${rule.id} added.`);
    }
  );

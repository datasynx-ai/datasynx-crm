import { Command } from "commander";
import { info, bold } from "../ui/colors.js";
import {
  listConversations,
  getConversation,
  replyConversation,
  assignConversation,
  type ConversationStatus,
  type ConversationChannel,
} from "../core/conversations.js";

const dataDir = (): string => process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export const inboxCommand = new Command("inbox").description(
  "Omnichannel conversations inbox (web-chat, WhatsApp)"
);

inboxCommand
  .command("list")
  .description("List conversations")
  .option("--status <status>", "open | assigned | closed")
  .option("--slug <slug>", "Filter to one customer")
  .option("--channel <channel>", "web | whatsapp | slack | telegram")
  .action((opts: { status?: string; slug?: string; channel?: string }) => {
    const convs = listConversations(dataDir(), {
      ...(opts.status ? { status: opts.status as ConversationStatus } : {}),
      ...(opts.slug ? { slug: opts.slug } : {}),
      ...(opts.channel ? { channel: opts.channel as ConversationChannel } : {}),
    });
    if (convs.length === 0) {
      console.log(info("No conversations match."));
      return;
    }
    for (const c of convs) {
      const who = c.contact.name || c.contact.email || c.contact.phone || "anon";
      console.log(
        `${bold(c.id)} [${c.channel}/${c.status}] ${who} → ${c.slug ?? "(unlinked)"}  ` +
          `${c.messages.length} msg · ${c.messages.at(-1)?.text.slice(0, 60) ?? ""}`
      );
    }
  });

inboxCommand
  .command("show <id>")
  .description("Show a conversation transcript")
  .action((id: string) => {
    const c = getConversation(dataDir(), id);
    if (!c) {
      console.log(info(`Conversation '${id}' not found.`));
      return;
    }
    console.log(bold(`${c.id} [${c.channel}/${c.status}] → ${c.slug ?? "(unlinked)"}`));
    for (const m of c.messages) {
      console.log(`  ${m.from === "agent" ? (m.by ?? "agent") : "customer"}: ${m.text}`);
    }
  });

inboxCommand
  .command("reply <id> <message>")
  .description("Reply to a conversation")
  .option("--by <actor>", "Replying actor")
  .option("--close", "Close after replying")
  .action(async (id: string, message: string, opts: { by?: string; close?: boolean }) => {
    const c = await replyConversation(dataDir(), id, {
      message,
      ...(opts.by ? { by: opts.by } : {}),
      ...(opts.close ? { close: true } : {}),
    });
    console.log(c ? info(`Replied to ${id} (status: ${c.status}).`) : info(`'${id}' not found.`));
  });

inboxCommand
  .command("assign <id>")
  .description("Assign, link, close, or escalate a conversation")
  .option("--to <actor>", "Assignee")
  .option("--slug <slug>", "Link to a customer")
  .option("--status <status>", "open | assigned | closed")
  .option("--escalate", "Escalate to a support ticket")
  .option("--title <title>", "Ticket title (with --escalate)")
  .action(
    async (
      id: string,
      opts: { to?: string; slug?: string; status?: string; escalate?: boolean; title?: string }
    ) => {
      try {
        const c = await assignConversation(dataDir(), id, {
          ...(opts.to ? { assignee: opts.to } : {}),
          ...(opts.slug ? { slug: opts.slug } : {}),
          ...(opts.status ? { status: opts.status as ConversationStatus } : {}),
          ...(opts.escalate ? { escalateToTicket: true } : {}),
          ...(opts.title ? { ticketTitle: opts.title } : {}),
        });
        if (!c) {
          console.log(info(`'${id}' not found.`));
          return;
        }
        console.log(
          info(
            `Updated ${id}: status=${c.status}, assignee=${c.assignee ?? "—"}` +
              (c.ticketId ? `, ticket=${c.ticketId}` : "")
          )
        );
      } catch (err) {
        console.log(info(err instanceof Error ? err.message : String(err)));
      }
    }
  );

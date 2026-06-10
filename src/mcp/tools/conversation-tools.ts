import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { enforceRbac } from "../../core/rbac.js";
import {
  listConversations,
  replyConversation,
  assignConversation,
  type ConversationChannel,
  type ConversationStatus,
} from "../../core/conversations.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

function ok(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

// ─── list_conversations ─────────────────────────────────────────────────────

export async function handleListConversations(
  input: { status?: ConversationStatus; slug?: string; channel?: ConversationChannel },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const conversations = listConversations(dataDir, input).map((c) => ({
    id: c.id,
    channel: c.channel,
    slug: c.slug,
    status: c.status,
    assignee: c.assignee ?? null,
    contact: c.contact,
    messages: c.messages.length,
    lastMessageAt: c.lastMessageAt,
    lastMessage: c.messages.at(-1)?.text ?? "",
    ticketId: c.ticketId ?? null,
  }));
  return ok({ count: conversations.length, conversations });
}

export function registerListConversations(server: McpServer): void {
  server.registerTool(
    "list_conversations",
    {
      title: "List Conversations",
      description: `List omnichannel inbox conversations (#57) across web-chat, WhatsApp, Slack and
Telegram. Filter by status (open/assigned/closed), customer slug, or channel.
Each entry summarizes the thread (last message, message count, assignee, linked
ticket). Returns: { count, conversations[] }`,
      inputSchema: z.object({
        status: z.enum(["open", "assigned", "closed"]).optional(),
        slug: z.string().optional().describe("Filter to one customer"),
        channel: z.enum(["web", "whatsapp", "slack", "telegram"]).optional(),
      }),
    },
    async (input) => handleListConversations(input as never)
  );
}

// ─── reply_conversation ─────────────────────────────────────────────────────

export async function handleReplyConversation(
  input: { id: string; message: string; by?: string; close?: boolean },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  enforceRbac(dataDir, "reply_conversation");
  const send = await buildSender(dataDir);
  const conv = await replyConversation(
    dataDir,
    input.id,
    {
      message: input.message,
      ...(input.by ? { by: input.by } : {}),
      ...(input.close ? { close: true } : {}),
    },
    send ? { send } : {}
  );
  if (!conv) return ok({ success: false, error: `Conversation '${input.id}' not found` });
  return ok({ success: true, id: conv.id, status: conv.status, messages: conv.messages.length });
}

export function registerReplyConversation(server: McpServer): void {
  server.registerTool(
    "reply_conversation",
    {
      title: "Reply to Conversation",
      description: `Send an agent reply on an inbox conversation (#57). The reply is delivered back
on the originating channel (best-effort; WhatsApp/web outbound is credential-
gated), recorded on the thread and the customer timeline, and fires
conversation.replied. Set close to resolve the thread. RBAC: rep+.
Returns: { success, id, status, messages }`,
      inputSchema: z.object({
        id: z.string().describe("Conversation id (conv_…)"),
        message: z.string().describe("Agent reply text"),
        by: z.string().optional().describe("Replying actor"),
        close: z.boolean().optional().describe("Close the conversation after replying"),
      }),
    },
    async (input) => handleReplyConversation(input as never)
  );
}

// ─── assign_conversation ────────────────────────────────────────────────────

export async function handleAssignConversation(
  input: {
    id: string;
    assignee?: string;
    slug?: string;
    status?: ConversationStatus;
    escalateToTicket?: boolean;
    ticketTitle?: string;
    priority?: "urgent" | "high" | "normal" | "low";
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  enforceRbac(dataDir, "assign_conversation");
  try {
    const conv = await assignConversation(dataDir, input.id, input);
    if (!conv) return ok({ success: false, error: `Conversation '${input.id}' not found` });
    return ok({
      success: true,
      id: conv.id,
      status: conv.status,
      assignee: conv.assignee ?? null,
      slug: conv.slug,
      ticketId: conv.ticketId ?? null,
    });
  } catch (err) {
    return ok({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}

export function registerAssignConversation(server: McpServer): void {
  server.registerTool(
    "assign_conversation",
    {
      title: "Assign Conversation",
      description: `Assign, (re)link, close, or escalate an inbox conversation (#57). Set assignee to
route it to a rep, slug to link it to a customer, status to open/assigned/closed,
or escalateToTicket to open a support ticket seeded with the transcript (requires
a linked customer). Fires conversation.assigned / conversation.escalated.
RBAC: rep+. Returns: { success, id, status, assignee, slug, ticketId }`,
      inputSchema: z.object({
        id: z.string().describe("Conversation id (conv_…)"),
        assignee: z.string().optional(),
        slug: z.string().optional().describe("Link the thread to this customer"),
        status: z.enum(["open", "assigned", "closed"]).optional(),
        escalateToTicket: z.boolean().optional(),
        ticketTitle: z.string().optional(),
        priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
      }),
    },
    async (input) => handleAssignConversation(input as never)
  );
}

// ─── outbound sender (best-effort, credential-gated) ────────────────────────────

async function buildSender(
  _dataDir: string
): Promise<
  | ((msg: {
      channel: ConversationChannel;
      threadKey: string;
      contact: { name?: string; email?: string; phone?: string };
      text: string;
    }) => Promise<void>)
  | null
> {
  const token = process.env["WHATSAPP_TOKEN"];
  const phoneId = process.env["WHATSAPP_PHONE_ID"];
  if (!token || !phoneId) return null; // offline → reply is recorded only
  return async (msg) => {
    if (msg.channel !== "whatsapp" || !msg.contact.phone) return;
    await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: msg.contact.phone,
        type: "text",
        text: { body: msg.text },
      }),
    });
  };
}

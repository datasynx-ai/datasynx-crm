import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import { readJsonFile, writeJsonFile } from "../fs/json-store.js";
import { buildRoutingTable, routeMessage } from "../sync/email-router.js";
import { emitEvent } from "./webhooks.js";
import { logger } from "./logger.js";

/**
 * Omnichannel conversations inbox (#57): inbound messages from the web-chat
 * widget and WhatsApp (and, later, Slack/Telegram) are unified into channel-
 * spanning threads. Each thread is routed to a customer (by email via the
 * email-router; phone/anonymous threads stay assignable), logged to the CRM
 * timeline, and can be replied to, assigned, closed, and escalated to a ticket.
 */

export type ConversationChannel = "web" | "whatsapp" | "slack" | "telegram";
export type ConversationStatus = "open" | "assigned" | "closed";

export interface ConversationMessage {
  from: "customer" | "agent" | "system";
  text: string;
  at: string;
  by?: string;
}

export interface ConversationContact {
  name?: string;
  email?: string;
  phone?: string;
}

export interface Conversation {
  id: string;
  channel: ConversationChannel;
  /** Stable per-channel thread key (web session id, WhatsApp wa_id, …). */
  threadKey: string;
  slug: string | null;
  contact: ConversationContact;
  status: ConversationStatus;
  assignee?: string;
  ticketId?: string;
  messages: ConversationMessage[];
  createdAt: string;
  lastMessageAt: string;
}

// ─── Store ──────────────────────────────────────────────────────────────────

function convDir(dataDir: string): string {
  return path.join(dataDir, ".agentic", "conversations");
}
function convPath(dataDir: string, id: string): string {
  return path.join(convDir(dataDir), `${id}.json`);
}

export function listConversations(
  dataDir: string,
  filter: { status?: ConversationStatus; slug?: string; channel?: ConversationChannel } = {}
): Conversation[] {
  const dir = convDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      const c = readJsonFile<Conversation | null>(path.join(dir, f), null);
      return c?.id ? [c] : [];
    })
    .filter((c) => {
      if (filter.status && c.status !== filter.status) return false;
      if (filter.slug && c.slug !== filter.slug) return false;
      if (filter.channel && c.channel !== filter.channel) return false;
      return true;
    })
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export function getConversation(dataDir: string, id: string): Conversation | null {
  if (!/^conv_[A-Za-z0-9_-]+$/.test(id)) return null;
  return readJsonFile<Conversation | null>(convPath(dataDir, id), null);
}

export function writeConversation(dataDir: string, conv: Conversation): void {
  writeJsonFile(convPath(dataDir, conv.id), conv);
}

function findOpenThread(
  dataDir: string,
  channel: ConversationChannel,
  threadKey: string
): Conversation | null {
  return (
    listConversations(dataDir, { channel }).find(
      (c) => c.threadKey === threadKey && c.status !== "closed"
    ) ?? null
  );
}

// ─── Routing ────────────────────────────────────────────────────────────────

/** Resolve the customer slug for a contact (email via router; else null). */
export function resolveConversationSlug(
  dataDir: string,
  contact: ConversationContact
): string | null {
  if (!contact.email) return null;
  return routeMessage([contact.email], buildRoutingTable(dataDir));
}

function contactLabel(contact: ConversationContact): string {
  return contact.name || contact.email || contact.phone || "Website visitor";
}

// ─── Inbound ──────────────────────────────────────────────────────────────────

export interface IngestInput {
  channel: ConversationChannel;
  threadKey: string;
  contact: ConversationContact;
  text: string;
}

/** Ingest an inbound message: append to the open thread or open a new one. */
export async function ingestInbound(dataDir: string, input: IngestInput): Promise<Conversation> {
  const now = new Date().toISOString();
  const existing = findOpenThread(dataDir, input.channel, input.threadKey);

  let conv: Conversation;
  let isNew = false;
  if (existing) {
    conv = existing;
    // Merge any newly-learned contact fields and (re)resolve the slug if needed.
    conv.contact = { ...conv.contact, ...stripUndefined(input.contact) };
    if (!conv.slug) conv.slug = resolveConversationSlug(dataDir, conv.contact);
  } else {
    isNew = true;
    conv = {
      id: `conv_${randomUUID().slice(0, 12)}`,
      channel: input.channel,
      threadKey: input.threadKey,
      slug: resolveConversationSlug(dataDir, input.contact),
      contact: stripUndefined(input.contact),
      status: "open",
      messages: [],
      createdAt: now,
      lastMessageAt: now,
    };
  }

  conv.messages.push({ from: "customer", text: input.text, at: now });
  conv.lastMessageAt = now;
  writeConversation(dataDir, conv);

  // Mirror onto the CRM timeline when the thread is tied to a customer.
  if (conv.slug) {
    const { appendInteraction } = await import("../fs/interactions-writer.js");
    await appendInteraction(dataDir, conv.slug, {
      date: now.slice(0, 10),
      type: "Note",
      direction: "inbound",
      with: contactLabel(conv.contact),
      subject: `${channelLabel(conv.channel)} message`,
      summary: input.text.slice(0, 1000),
      nextSteps: [],
      sourceRef: `conversation:${conv.id}:${conv.messages.length}`,
      synced: now,
    }).catch(() => undefined);
  }

  await emitEvent(dataDir, isNew ? "conversation.created" : "conversation.message", {
    conversationId: conv.id,
    slug: conv.slug ?? "",
    channel: conv.channel,
    from: contactLabel(conv.contact),
    text: input.text,
  }).catch(() => undefined);

  logger.info("conversations", isNew ? "thread opened" : "inbound message", {
    id: conv.id,
    channel: conv.channel,
    slug: conv.slug,
  });
  return conv;
}

// ─── Reply ────────────────────────────────────────────────────────────────────

export interface ReplyInput {
  message: string;
  by?: string;
  close?: boolean;
}

export interface ReplyDeps {
  /** Outbound sender (WhatsApp Cloud API / web push). Best-effort, injected. */
  send?: (msg: {
    channel: ConversationChannel;
    threadKey: string;
    contact: ConversationContact;
    text: string;
  }) => Promise<void>;
}

export async function replyConversation(
  dataDir: string,
  id: string,
  input: ReplyInput,
  deps: ReplyDeps = {}
): Promise<Conversation | null> {
  const conv = getConversation(dataDir, id);
  if (!conv) return null;
  const now = new Date().toISOString();

  conv.messages.push({
    from: "agent",
    text: input.message,
    at: now,
    ...(input.by ? { by: input.by } : {}),
  });
  conv.lastMessageAt = now;
  if (input.close) conv.status = "closed";
  writeConversation(dataDir, conv);

  if (deps.send) {
    await deps
      .send({
        channel: conv.channel,
        threadKey: conv.threadKey,
        contact: conv.contact,
        text: input.message,
      })
      .catch((err) =>
        logger.warn("conversations", "outbound send failed (reply still recorded)", {
          id: conv.id,
          error: err instanceof Error ? err.message : String(err),
        })
      );
  }

  if (conv.slug) {
    const { appendInteraction } = await import("../fs/interactions-writer.js");
    await appendInteraction(dataDir, conv.slug, {
      date: now.slice(0, 10),
      type: "Note",
      direction: "outbound",
      with: contactLabel(conv.contact),
      subject: `${channelLabel(conv.channel)} reply`,
      summary: input.message.slice(0, 1000),
      nextSteps: [],
      sourceRef: `conversation:${conv.id}:${conv.messages.length}`,
      synced: now,
    }).catch(() => undefined);
  }

  await emitEvent(dataDir, "conversation.replied", {
    conversationId: conv.id,
    slug: conv.slug ?? "",
    channel: conv.channel,
    by: input.by ?? "agent",
    closed: conv.status === "closed",
  }).catch(() => undefined);

  logger.info("conversations", "agent reply", { id: conv.id, closed: conv.status === "closed" });
  return conv;
}

// ─── Assign / close / escalate ─────────────────────────────────────────────────

export interface AssignInput {
  assignee?: string;
  slug?: string;
  status?: ConversationStatus;
  escalateToTicket?: boolean;
  ticketTitle?: string;
  priority?: "urgent" | "high" | "normal" | "low";
}

export async function assignConversation(
  dataDir: string,
  id: string,
  input: AssignInput
): Promise<Conversation | null> {
  const conv = getConversation(dataDir, id);
  if (!conv) return null;

  if (input.slug) conv.slug = input.slug;
  if (input.assignee) {
    conv.assignee = input.assignee;
    if (conv.status === "open") conv.status = "assigned";
  }
  if (input.status) conv.status = input.status;

  let escalated = false;
  if (input.escalateToTicket) {
    if (!conv.slug) {
      throw new Error("Cannot escalate a conversation that is not linked to a customer.");
    }
    const { handleCreateTicket } = await import("../mcp/tools/create-ticket.js");
    const transcript = conv.messages
      .map((m) => `${m.from === "agent" ? (m.by ?? "agent") : "customer"}: ${m.text}`)
      .join("\n")
      .slice(0, 2000);
    const res = await handleCreateTicket(
      {
        slug: conv.slug,
        title: input.ticketTitle || `Conversation ${conv.id}`,
        description: transcript,
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.assignee ? { assignee: input.assignee } : {}),
        tags: [`channel:${conv.channel}`, "from-conversation"],
      },
      dataDir
    );
    const ticket = (JSON.parse(res.content[0]!.text) as { ticket?: { id: string } }).ticket;
    if (ticket?.id) {
      conv.ticketId = ticket.id;
      escalated = true;
    }
  }

  writeConversation(dataDir, conv);

  await emitEvent(dataDir, "conversation.assigned", {
    conversationId: conv.id,
    slug: conv.slug ?? "",
    assignee: conv.assignee ?? "",
    status: conv.status,
  }).catch(() => undefined);

  if (escalated) {
    await emitEvent(dataDir, "conversation.escalated", {
      conversationId: conv.id,
      slug: conv.slug ?? "",
      ticketId: conv.ticketId,
    }).catch(() => undefined);
  }

  logger.info("conversations", "assigned", {
    id: conv.id,
    assignee: conv.assignee,
    status: conv.status,
    ticketId: conv.ticketId,
  });
  return conv;
}

// ─── Delivery channel (#62) ───────────────────────────────────────────────────

export interface PollInput {
  channel: ConversationChannel;
  threadKey: string;
  /** Message-count cursor from the previous poll; 0 returns the full thread. */
  after?: number;
}

export interface PollResult {
  messages: ConversationMessage[];
  cursor: number;
  status: ConversationStatus | null;
}

/**
 * Cursor-based read for the web-chat delivery loop: the widget polls with the
 * last cursor and receives everything newer. Reads the *latest* thread for the
 * key — including closed ones, so a reply sent with `close` still reaches the
 * visitor. Unknown keys yield an empty result (no session enumeration).
 */
export function pollMessages(dataDir: string, input: PollInput): PollResult {
  // listConversations sorts by lastMessageAt desc → first match is the latest.
  const conv =
    listConversations(dataDir, { channel: input.channel }).find(
      (c) => c.threadKey === input.threadKey
    ) ?? null;
  if (!conv) return { messages: [], cursor: 0, status: null };
  const after = Math.max(0, Math.floor(input.after ?? 0));
  return {
    messages: conv.messages.slice(after),
    cursor: conv.messages.length,
    status: conv.status,
  };
}

// ─── WhatsApp inbound parsing (Meta Cloud API) ──────────────────────────────────

export interface WhatsAppInboundMessage {
  from: string;
  name?: string;
  text: string;
}

/** Extract text messages from a Meta WhatsApp Cloud API webhook payload. */
export function parseWhatsAppInbound(payload: unknown): WhatsAppInboundMessage[] {
  const out: WhatsAppInboundMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes ?? [];
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value ?? {};
      const contacts =
        (value["contacts"] as Array<{ profile?: { name?: string }; wa_id?: string }>) ?? [];
      const nameByWaId = new Map(contacts.map((c) => [c.wa_id, c.profile?.name]));
      const messages =
        (value["messages"] as Array<{ from?: string; text?: { body?: string } }>) ?? [];
      for (const m of messages) {
        if (!m.from || !m.text?.body) continue;
        const name = nameByWaId.get(m.from);
        out.push({ from: m.from, ...(name ? { name } : {}), text: m.text.body });
      }
    }
  }
  return out;
}

// ─── Web-chat widget ────────────────────────────────────────────────────────────

/**
 * Minimal embeddable web-chat widget: POSTs to /chat (with a hidden honeypot,
 * #61) and polls /chat/poll every 3 s for agent replies (#62). Polling starts
 * with the first interaction — or immediately for returning sessions — so idle
 * embeds generate no traffic. Customer messages are echoed locally and skipped
 * on poll to avoid duplicates.
 */
export function renderChatWidget(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `(function(){
  var existing = localStorage.getItem('dxcrm_chat_sid');
  var sid = existing || ('web-' + Math.random().toString(36).slice(2));
  localStorage.setItem('dxcrm_chat_sid', sid);
  var cursor = 0, timer = null;
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;bottom:20px;right:20px;width:300px;font-family:Arial,sans-serif;border:1px solid #ddd;border-radius:10px;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.15);overflow:hidden;z-index:99999';
  box.innerHTML = '<div style="background:#1a1a2e;color:#fff;padding:10px;font-weight:bold">Chat with us</div>'
    + '<div id="dxcrm-log" style="height:180px;overflow:auto;padding:8px;font-size:14px"></div>'
    + '<form id="dxcrm-f" style="display:flex;border-top:1px solid #eee">'
    + '<input id="dxcrm-email" type="email" placeholder="email (optional)" style="width:100%;border:0;padding:6px;border-bottom:1px solid #eee">'
    + '</form>'
    + '<form id="dxcrm-m" style="display:flex;border-top:1px solid #eee">'
    + '<input id="dxcrm-t" placeholder="Type a message…" required style="flex:1;border:0;padding:8px">'
    + '<input id="dxcrm-hp" name="_hp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">'
    + '<button style="border:0;background:#1a1a2e;color:#fff;padding:0 14px;cursor:pointer">Send</button></form>';
  document.body.appendChild(box);
  function esc(s){ return String(s).replace(/[<>&]/g,''); }
  function poll(){
    fetch('${base}/chat/poll?sessionId=' + encodeURIComponent(sid) + '&after=' + cursor)
      .then(function(r){ return r.json(); })
      .then(function(d){
        var log = document.getElementById('dxcrm-log');
        (d.messages || []).forEach(function(m){
          if (m.from === 'customer') return;
          log.innerHTML += '<div style="margin:4px 0"><span style="background:#f1f5f9;padding:4px 8px;border-radius:8px;display:inline-block">' + esc(m.text) + '</span></div>';
          log.scrollTop = log.scrollHeight;
        });
        if (typeof d.cursor === 'number') cursor = d.cursor;
      }).catch(function(){});
  }
  function startPolling(){ if (!timer) { poll(); timer = setInterval(poll, 3000); } }
  if (existing) startPolling();
  document.getElementById('dxcrm-m').addEventListener('submit', function(e){
    e.preventDefault();
    var t = document.getElementById('dxcrm-t').value;
    var email = document.getElementById('dxcrm-email').value;
    var hp = document.getElementById('dxcrm-hp').value;
    var log = document.getElementById('dxcrm-log');
    log.innerHTML += '<div style="text-align:right;margin:4px 0"><span style="background:#dbeafe;padding:4px 8px;border-radius:8px;display:inline-block">' + esc(t) + '</span></div>';
    document.getElementById('dxcrm-t').value = '';
    fetch('${base}/chat', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sid,email:email,message:t,_hp:hp})})
      .then(function(){ startPolling(); });
  });
})();`;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function channelLabel(channel: ConversationChannel): string {
  return channel === "web" ? "Web chat" : channel === "whatsapp" ? "WhatsApp" : channel;
}

function stripUndefined(contact: ConversationContact): ConversationContact {
  const out: ConversationContact = {};
  if (contact.name) out.name = contact.name;
  if (contact.email) out.email = contact.email;
  if (contact.phone) out.phone = contact.phone;
  return out;
}

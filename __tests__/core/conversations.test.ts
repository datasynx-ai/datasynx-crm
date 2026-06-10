import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

const DATA_DIR = "/data";

beforeEach(async () => {
  vol.reset();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  vol.mkdirSync(`${DATA_DIR}/.agentic`, { recursive: true });
  const { createCustomer } = await import("../../src/commands/create.js");
  await createCustomer({ name: "Acme", domain: "acme.com", dataDir: DATA_DIR });
});

describe("ingestInbound (#57)", () => {
  it("creates a conversation, routes by email, logs an interaction, emits", async () => {
    const { ingestInbound, getConversation } = await import("../../src/core/conversations.js");
    const conv = await ingestInbound(DATA_DIR, {
      channel: "web",
      threadKey: "sess-1",
      contact: { email: "jane@acme.com", name: "Jane" },
      text: "Hi, I need help",
    });
    expect(conv.slug).toBe("acme");
    expect(conv.status).toBe("open");
    expect(conv.messages).toHaveLength(1);
    expect(conv.messages[0]).toMatchObject({ from: "customer", text: "Hi, I need help" });
    expect(getConversation(DATA_DIR, conv.id)?.id).toBe(conv.id);

    const fs = (await import("fs")).default;
    const md = fs.readFileSync(`${DATA_DIR}/customers/acme/interactions.md`, "utf-8") as string;
    expect(md).toContain("conversation:" + conv.id);
    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "conversation.created",
      expect.objectContaining({ conversationId: conv.id, slug: "acme", channel: "web" })
    );
  });

  it("appends to the existing open thread instead of creating a new one", async () => {
    const { ingestInbound, listConversations } = await import("../../src/core/conversations.js");
    const a = await ingestInbound(DATA_DIR, {
      channel: "whatsapp",
      threadKey: "+15551230000",
      contact: { phone: "+15551230000" },
      text: "first",
    });
    const b = await ingestInbound(DATA_DIR, {
      channel: "whatsapp",
      threadKey: "+15551230000",
      contact: { phone: "+15551230000" },
      text: "second",
    });
    expect(b.id).toBe(a.id);
    expect(b.messages.map((m) => m.text)).toEqual(["first", "second"]);
    expect(listConversations(DATA_DIR, {})).toHaveLength(1);
    // unmatched phone → no slug, still tracked
    expect(b.slug).toBeNull();
    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "conversation.message",
      expect.objectContaining({ conversationId: a.id })
    );
  });
});

describe("replyConversation (#57)", () => {
  it("adds an agent message, sends outbound, emits, and can close", async () => {
    const { ingestInbound, replyConversation } = await import("../../src/core/conversations.js");
    const conv = await ingestInbound(DATA_DIR, {
      channel: "web",
      threadKey: "s",
      contact: { email: "jane@acme.com" },
      text: "hello",
    });
    const send = vi.fn().mockResolvedValue(undefined);
    const replied = await replyConversation(
      DATA_DIR,
      conv.id,
      { message: "Hi Jane, how can I help?", by: "alice", close: true },
      { send }
    );
    expect(replied!.messages.at(-1)).toMatchObject({
      from: "agent",
      text: "Hi Jane, how can I help?",
    });
    expect(replied!.status).toBe("closed");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "web", text: "Hi Jane, how can I help?" })
    );
    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "conversation.replied",
      expect.objectContaining({ conversationId: conv.id, by: "alice" })
    );
    expect(await replyConversation(DATA_DIR, "nope", { message: "x" })).toBeNull();
  });
});

describe("assignConversation (#57)", () => {
  it("assigns, links a customer, and escalates to a ticket", async () => {
    const { ingestInbound, assignConversation } = await import("../../src/core/conversations.js");
    const conv = await ingestInbound(DATA_DIR, {
      channel: "web",
      threadKey: "s",
      contact: { email: "jane@acme.com" },
      text: "My invoice is wrong",
    });
    const assigned = await assignConversation(DATA_DIR, conv.id, {
      assignee: "alice",
      escalateToTicket: true,
      ticketTitle: "Invoice dispute",
    });
    expect(assigned!.assignee).toBe("alice");
    expect(assigned!.status).toBe("assigned");
    expect(assigned!.ticketId).toMatch(/^T-\d{3}$/);

    const { readTickets } = await import("../../src/fs/ticket-writer.js");
    const tickets = await readTickets(DATA_DIR, "acme");
    expect(tickets.some((t) => t.id === assigned!.ticketId)).toBe(true);
    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "conversation.escalated",
      expect.objectContaining({ conversationId: conv.id, ticketId: assigned!.ticketId })
    );
  });

  it("refuses to escalate a conversation with no customer", async () => {
    const { ingestInbound, assignConversation } = await import("../../src/core/conversations.js");
    const conv = await ingestInbound(DATA_DIR, {
      channel: "whatsapp",
      threadKey: "+1999",
      contact: { phone: "+1999" },
      text: "hi",
    });
    await expect(
      assignConversation(DATA_DIR, conv.id, { escalateToTicket: true })
    ).rejects.toThrow();
  });

  it("can set status to closed", async () => {
    const { ingestInbound, assignConversation } = await import("../../src/core/conversations.js");
    const conv = await ingestInbound(DATA_DIR, {
      channel: "web",
      threadKey: "s",
      contact: { email: "jane@acme.com" },
      text: "thanks",
    });
    const closed = await assignConversation(DATA_DIR, conv.id, { status: "closed" });
    expect(closed!.status).toBe("closed");
  });
});

describe("listConversations filters (#57)", () => {
  it("filters by status, slug and channel", async () => {
    const { ingestInbound, assignConversation, listConversations } =
      await import("../../src/core/conversations.js");
    const a = await ingestInbound(DATA_DIR, {
      channel: "web",
      threadKey: "a",
      contact: { email: "jane@acme.com" },
      text: "1",
    });
    await ingestInbound(DATA_DIR, {
      channel: "whatsapp",
      threadKey: "b",
      contact: { phone: "+1" },
      text: "2",
    });
    await assignConversation(DATA_DIR, a.id, { status: "closed" });

    expect(listConversations(DATA_DIR, { status: "open" })).toHaveLength(1);
    expect(listConversations(DATA_DIR, { channel: "web" })).toHaveLength(1);
    expect(listConversations(DATA_DIR, { slug: "acme" }).map((c) => c.id)).toEqual([a.id]);
  });
});

describe("WhatsApp payload parsing (#57)", () => {
  it("extracts inbound messages from the Meta Cloud API shape", async () => {
    const { parseWhatsAppInbound } = await import("../../src/core/conversations.js");
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: "Bob" }, wa_id: "15557654321" }],
                messages: [{ from: "15557654321", text: { body: "hey there" }, type: "text" }],
              },
            },
          ],
        },
      ],
    };
    const msgs = parseWhatsAppInbound(payload);
    expect(msgs).toEqual([{ from: "15557654321", name: "Bob", text: "hey there" }]);
    expect(parseWhatsAppInbound({})).toEqual([]);
  });
});

describe("pollMessages (#62)", () => {
  it("returns all messages and a cursor for a known session", async () => {
    const { ingestInbound, replyConversation, pollMessages } =
      await import("../../src/core/conversations.js");
    const conv = await ingestInbound(DATA_DIR, {
      channel: "web",
      threadKey: "sess-poll",
      contact: {},
      text: "hello?",
    });
    await replyConversation(DATA_DIR, conv.id, { message: "Hi, how can I help?", by: "alice" });

    const result = pollMessages(DATA_DIR, { channel: "web", threadKey: "sess-poll" });
    expect(result.cursor).toBe(2);
    expect(result.status).toBe("open");
    expect(result.messages.map((m) => m.from)).toEqual(["customer", "agent"]);
    expect(result.messages[1]?.text).toBe("Hi, how can I help?");
  });

  it("returns only messages after the cursor", async () => {
    const { ingestInbound, replyConversation, pollMessages } =
      await import("../../src/core/conversations.js");
    const conv = await ingestInbound(DATA_DIR, {
      channel: "web",
      threadKey: "sess-cursor",
      contact: {},
      text: "first",
    });
    const first = pollMessages(DATA_DIR, { channel: "web", threadKey: "sess-cursor" });
    expect(first.cursor).toBe(1);

    await replyConversation(DATA_DIR, conv.id, { message: "answer" });
    const next = pollMessages(DATA_DIR, {
      channel: "web",
      threadKey: "sess-cursor",
      after: first.cursor,
    });
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]).toMatchObject({ from: "agent", text: "answer" });
    expect(next.cursor).toBe(2);

    const idle = pollMessages(DATA_DIR, {
      channel: "web",
      threadKey: "sess-cursor",
      after: next.cursor,
    });
    expect(idle.messages).toHaveLength(0);
    expect(idle.cursor).toBe(2);
  });

  it("still delivers a reply that closed the thread", async () => {
    const { ingestInbound, replyConversation, pollMessages } =
      await import("../../src/core/conversations.js");
    const conv = await ingestInbound(DATA_DIR, {
      channel: "web",
      threadKey: "sess-closed",
      contact: {},
      text: "are you open tomorrow?",
    });
    await replyConversation(DATA_DIR, conv.id, { message: "Yes — see you!", close: true });

    const result = pollMessages(DATA_DIR, { channel: "web", threadKey: "sess-closed", after: 1 });
    expect(result.status).toBe("closed");
    expect(result.messages.map((m) => m.text)).toEqual(["Yes — see you!"]);
  });

  it("returns an empty result for unknown sessions", async () => {
    const { pollMessages } = await import("../../src/core/conversations.js");
    expect(pollMessages(DATA_DIR, { channel: "web", threadKey: "nope" })).toEqual({
      messages: [],
      cursor: 0,
      status: null,
    });
  });
});

describe("renderChatWidget (#61/#62)", () => {
  it("ships a honeypot field and posts it with each message", async () => {
    const { renderChatWidget } = await import("../../src/core/conversations.js");
    const js = renderChatWidget("https://crm.example.com/");
    expect(js).toContain("_hp");
    expect(js).toContain("https://crm.example.com/chat");
  });

  it("polls /chat/poll for agent replies", async () => {
    const { renderChatWidget } = await import("../../src/core/conversations.js");
    const js = renderChatWidget("https://crm.example.com");
    expect(js).toContain("/chat/poll");
    expect(js).toContain("cursor");
  });
});

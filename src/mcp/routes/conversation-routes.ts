import type { Express } from "express";
import { clientIp, createRateLimiter } from "../../core/http-guard.js";
import { resolveSecret } from "../../core/secrets.js";

/**
 * Public omnichannel-inbox routes (#57, hardened in #61, delivery in #62):
 * the embeddable web-chat widget, its inbound + poll endpoints, and the
 * WhatsApp Cloud API webhook. Extracted from `startHttp()` so the routes can
 * be integration-tested against a real express app.
 *
 * Rate limits are per IP and sized to each surface: humans typing (`/chat`),
 * a widget polling every ~3 s (`/chat/poll`), and Meta delivering batches
 * (`/webhooks/whatsapp`). The honeypot only exists on `/chat` — a server-to-
 * server webhook has no form to bait; HMAC verification is the auth there.
 */

const chatLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });
const pollLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const whatsappLimiter = createRateLimiter({ windowMs: 60_000, max: 100 });

/** Clears limiter state between tests. */
export function resetConversationGuards(): void {
  chatLimiter.reset();
  pollLimiter.reset();
  whatsappLimiter.reset();
}

export function registerConversationRoutes(app: Express, dataDir: string): void {
  // Omnichannel inbox (#57): embeddable web-chat widget script.
  app.get("/chat/widget.js", async (req, res) => {
    const { renderChatWidget } = await import("../../core/conversations.js");
    const base = `${req.protocol}://${req.get("host") ?? "localhost"}`;
    res.setHeader("content-type", "application/javascript");
    res.setHeader("cache-control", "no-store");
    res.send(renderChatWidget(base));
  });

  // Web-chat inbound: the widget POSTs messages here.
  app.post("/chat", async (req, res) => {
    if (chatLimiter.limited(clientIp(req))) {
      res.status(429).json({ error: "too many requests" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, string | undefined>;
    // Honeypot: bots fill every field — fake a success so they don't adapt.
    if (typeof b["_hp"] === "string" && b["_hp"].trim() !== "") {
      const { randomUUID } = await import("node:crypto");
      res.json({ ok: true, conversationId: `conv_${randomUUID().slice(0, 12)}`, status: "open" });
      return;
    }
    const message = (b["message"] ?? "").trim();
    const sessionId = (b["sessionId"] ?? "").trim();
    if (!message || !sessionId) {
      res.status(400).json({ error: "sessionId and message are required" });
      return;
    }
    const { ingestInbound } = await import("../../core/conversations.js");
    const contact: { name?: string; email?: string } = {};
    if (b["name"]) contact.name = b["name"]!.slice(0, 120);
    if (b["email"]) contact.email = b["email"]!.slice(0, 200);
    const conv = await ingestInbound(dataDir, {
      channel: "web",
      threadKey: sessionId,
      contact,
      text: message.slice(0, 2000),
    });
    res.json({ ok: true, conversationId: conv.id, status: conv.status });
  });

  // Web-chat delivery (#62): the widget polls agent replies from here.
  app.get("/chat/poll", async (req, res) => {
    if (pollLimiter.limited(clientIp(req))) {
      res.status(429).json({ error: "too many requests" });
      return;
    }
    const q = req.query as Record<string, string | undefined>;
    const sessionId = (q["sessionId"] ?? "").trim();
    if (!sessionId) {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }
    const after = Number(q["after"] ?? 0);
    const { pollMessages } = await import("../../core/conversations.js");
    const result = pollMessages(dataDir, {
      channel: "web",
      threadKey: sessionId,
      after: Number.isFinite(after) && after > 0 ? Math.floor(after) : 0,
    });
    res.setHeader("cache-control", "no-store");
    res.json(result);
  });

  // WhatsApp Cloud API webhook — GET verify handshake + POST inbound messages.
  app.get("/webhooks/whatsapp", (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const verifyToken = resolveSecret(dataDir, "WHATSAPP_VERIFY_TOKEN") ?? "";
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === verifyToken) {
      res.status(200).send(q["hub.challenge"] ?? "");
      return;
    }
    res.status(403).send("forbidden");
  });

  app.post("/webhooks/whatsapp", async (req, res) => {
    if (whatsappLimiter.limited(clientIp(req))) {
      res.status(429).json({ error: "too many requests" });
      return;
    }
    const appSecret = resolveSecret(dataDir, "WHATSAPP_APP_SECRET");
    if (appSecret) {
      const raw = (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
      const { verifyHmacSha256 } = await import("../../core/webhook-receiver.js");
      const sig = req.headers["x-hub-signature-256"] as string | undefined;
      if (!sig || !verifyHmacSha256(appSecret, Buffer.from(raw, "utf-8"), sig)) {
        res.status(401).json({ error: "invalid signature" });
        return;
      }
    }
    const { parseWhatsAppInbound, ingestInbound } = await import("../../core/conversations.js");
    const messages = parseWhatsAppInbound(req.body);
    for (const m of messages) {
      await ingestInbound(dataDir, {
        channel: "whatsapp",
        threadKey: m.from,
        contact: { phone: m.from, ...(m.name ? { name: m.name } : {}) },
        text: m.text,
      }).catch(() => undefined);
    }
    res.json({ ok: true, received: messages.length });
  });
}

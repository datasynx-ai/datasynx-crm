import express, { type Express } from "express";

/**
 * Quote-to-cash public surfaces (#49): the token-secured quote page with
 * online accept/decline and the Stripe payment webhook. Extracted from
 * `startHttp()` for route-level integration testing (#68, pattern #65).
 *
 * IMPORTANT: the Stripe webhook verifies the signature over the EXACT raw
 * request bytes — the app-level `express.json({ verify })` hook in
 * `startHttp()` must keep populating `req.rawBody` (a re-serialized
 * `req.body` would never match; same class of bug as the Slack finding
 * in #65).
 */
export function registerQuoteRoutes(app: Express, dataDir: string): void {
  // Render the quote with Accept / Decline actions. Token is HMAC-signed and
  // expires; an invalid/expired token never reveals quote data.
  app.get("/q/:token", async (req, res) => {
    const { verifyQuoteToken, renderQuotePage } = await import("../../core/quote-link.js");
    const raw = (req.params as Record<string, string>)["token"] ?? "";
    const payload = verifyQuoteToken(raw);
    if (!payload) {
      res.status(400).send("<h2>Invalid or expired quote link.</h2>");
      return;
    }
    const { readQuote, updateQuoteStatus } = await import("../../core/quote-generator.js");
    const quote = readQuote(dataDir, payload.q);
    if (!quote || quote.slug !== payload.s) {
      res.status(404).send("<h2>Quote not found.</h2>");
      return;
    }
    if (quote.status === "sent") updateQuoteStatus(dataDir, quote.quoteNumber, "viewed");
    res.setHeader("content-type", "text/html");
    res.send(renderQuotePage(quote, raw));
  });

  // Online acceptance — captures name + timestamp + IP as a signed receipt.
  app.post("/q/:token/accept", express.urlencoded({ extended: false }), async (req, res) => {
    const { verifyQuoteToken, acceptQuote, renderQuotePage } =
      await import("../../core/quote-link.js");
    const raw = (req.params as Record<string, string>)["token"] ?? "";
    const payload = verifyQuoteToken(raw);
    const name = ((req.body as Record<string, string | undefined>)["name"] ?? "").trim();
    if (!payload || !name) {
      res.status(400).send("<h2>Invalid request.</h2>");
      return;
    }
    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      undefined;
    const quote = await acceptQuote(dataDir, payload.q, { name, ...(ip ? { ip } : {}) });
    if (!quote) {
      res.status(404).send("<h2>Quote not found.</h2>");
      return;
    }
    res.setHeader("content-type", "text/html");
    res.send(renderQuotePage(quote, raw));
  });

  app.post("/q/:token/decline", async (req, res) => {
    const { verifyQuoteToken, declineQuote, renderQuotePage } =
      await import("../../core/quote-link.js");
    const raw = (req.params as Record<string, string>)["token"] ?? "";
    const payload = verifyQuoteToken(raw);
    if (!payload) {
      res.status(400).send("<h2>Invalid request.</h2>");
      return;
    }
    const quote = await declineQuote(dataDir, payload.q);
    if (!quote) {
      res.status(404).send("<h2>Quote not found.</h2>");
      return;
    }
    res.setHeader("content-type", "text/html");
    res.send(renderQuotePage(quote, raw));
  });

  // Stripe payment webhook → quote.paid (#49). Signature-checked; the quote
  // number rides in the payment link metadata.
  app.post("/webhooks/stripe", async (req, res) => {
    const whSecret = process.env["STRIPE_WEBHOOK_SECRET"];
    if (!whSecret) {
      res.status(503).json({ error: "stripe webhook not configured" });
      return;
    }
    const rawBody =
      (req as unknown as { rawBody?: string }).rawBody ??
      (Buffer.isBuffer(req.body) ? req.body.toString("utf-8") : JSON.stringify(req.body));
    const { verifyStripeSignature } = await import("../../plugins/stripe.js");
    if (
      !verifyStripeSignature(
        rawBody,
        req.headers["stripe-signature"] as string | undefined,
        whSecret
      )
    ) {
      res.status(401).json({ error: "invalid signature" });
      return;
    }
    try {
      const event = JSON.parse(rawBody) as {
        type: string;
        data?: { object?: { metadata?: Record<string, string> } };
      };
      const quoteNumber = event.data?.object?.metadata?.["quoteNumber"];
      if (
        quoteNumber &&
        (event.type === "checkout.session.completed" ||
          event.type === "payment_link.payment_succeeded" ||
          event.type === "payment_intent.succeeded")
      ) {
        const { markQuotePaid } = await import("../../core/quote-link.js");
        await markQuotePaid(dataDir, quoteNumber);
      }
      res.json({ received: true });
    } catch {
      res.status(400).json({ error: "invalid payload" });
    }
  });
}

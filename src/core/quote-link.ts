import { createHmac, timingSafeEqual } from "node:crypto";
import { readQuote, quoteFilePath } from "./quote-generator.js";
import { writeFileAtomic } from "../fs/atomic-write.js";
import { emitEvent } from "./webhooks.js";
import { appendInteraction } from "../fs/interactions-writer.js";
import { enqueueTask } from "./proactive-agent.js";
import { logger } from "./logger.js";
import type { Quote } from "../schemas/quote.js";

/** Quote-to-cash public link + acceptance/payment flow (#49). */

function secret(env: NodeJS.ProcessEnv = process.env): string {
  return env["DXCRM_QUOTE_SECRET"] ?? "dxcrm-quote-default-secret";
}

export function quoteBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env["DXCRM_SERVER_URL"] ?? "http://localhost:3847").replace(/\/+$/, "");
}

export interface QuoteTokenPayload {
  q: string; // quoteNumber
  s: string; // slug
  exp: number; // epoch ms expiry
}

function b64url(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64url");
}

export function signQuoteToken(
  payload: QuoteTokenPayload,
  env: NodeJS.ProcessEnv = process.env
): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret(env)).update(body).digest("hex").slice(0, 24);
  return `${body}.${sig}`;
}

/** Verify token signature AND expiry. Returns null on tamper or when expired. */
export function verifyQuoteToken(
  token: string,
  now: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env
): QuoteTokenPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret(env)).update(body).digest("hex").slice(0, 24);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf-8")
    ) as QuoteTokenPayload;
    if (!parsed.q || !parsed.s || typeof parsed.exp !== "number") return null;
    if (parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Build the public quote link for a quote (token valid for `days`). */
export function buildQuoteLink(
  quote: Quote,
  days = 30,
  env: NodeJS.ProcessEnv = process.env
): string {
  const exp = Date.now() + days * 86_400_000;
  const token = signQuoteToken({ q: quote.quoteNumber, s: quote.slug, exp }, env);
  return `${quoteBaseUrl(env)}/q/${token}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render the public quote page with Accept / Decline (and optional Pay) actions. */
export function renderQuotePage(quote: Quote, token: string): string {
  const rows = quote.lineItems
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.description)}</td><td style="text-align:right">${i.quantity}</td><td style="text-align:right">${i.unitPrice.toFixed(2)} ${escapeHtml(quote.currency)}</td><td style="text-align:right">${i.total.toFixed(2)} ${escapeHtml(quote.currency)}</td></tr>`
    )
    .join("\n");

  const settled =
    quote.status === "accepted" || quote.status === "paid" || quote.status === "declined";
  const actions = settled
    ? `<p class="status">This quote is <strong>${escapeHtml(quote.status)}</strong>.</p>${
        quote.paymentLinkUrl && quote.status === "accepted"
          ? `<p><a class="btn pay" href="${escapeHtml(quote.paymentLinkUrl)}">Pay now</a></p>`
          : ""
      }`
    : `<form method="POST" action="/q/${encodeURIComponent(token)}/accept" style="margin-top:24px">
<label>Your name:<br><input type="text" name="name" required style="padding:8px;width:280px"></label><br><br>
<button class="btn accept" type="submit">Accept quote</button>
</form>
<form method="POST" action="/q/${encodeURIComponent(token)}/decline" style="margin-top:12px">
<button class="btn decline" type="submit">Decline</button>
</form>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Quote ${escapeHtml(quote.quoteNumber)}</title>
<style>body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;color:#222;padding:0 16px}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #ddd}th{background:#f5f5f5}
.btn{padding:12px 28px;border:none;border-radius:4px;font-size:1em;cursor:pointer;color:#fff;text-decoration:none;display:inline-block}
.accept{background:#1a7f37}.decline{background:#777}.pay{background:#635bff}.status{font-size:1.1em}</style></head>
<body><h1>Quote ${escapeHtml(quote.quoteNumber)}</h1>
<p>For: <strong>${escapeHtml(quote.dealName)}</strong> · valid until ${escapeHtml(quote.validUntil)}</p>
<table><thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Total</th></tr></thead>
<tbody>${rows}</tbody></table>
<table style="width:320px;margin-left:auto;margin-top:12px">
<tr><td>Subtotal</td><td style="text-align:right">${quote.subtotal.toFixed(2)} ${escapeHtml(quote.currency)}</td></tr>
<tr><td>VAT (${quote.vatPercent}%)</td><td style="text-align:right">${quote.vat.toFixed(2)} ${escapeHtml(quote.currency)}</td></tr>
<tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${quote.total.toFixed(2)} ${escapeHtml(quote.currency)}</strong></td></tr></table>
${actions}
</body></html>`;
}

function writeQuote(dataDir: string, quote: Quote): void {
  writeFileAtomic(quoteFilePath(dataDir, quote.quoteNumber), JSON.stringify(quote, null, 2));
}

async function notify(dataDir: string, slug: string, message: string): Promise<void> {
  await enqueueTask(dataDir, {
    type: "follow_up_nudge",
    slug,
    priority: "high",
    payload: { message },
    scheduledFor: new Date().toISOString(),
    channel:
      process.env["TELEGRAM_BOT_TOKEN"] && process.env["TELEGRAM_CHAT_ID"]
        ? "telegram"
        : process.env["SLACK_WEBHOOK_URL"]
          ? "slack"
          : "mcp_tool_response",
  }).catch(() => undefined);
}

/** Online acceptance: store status + e-signature receipt, emit event, log, notify. */
export async function acceptQuote(
  dataDir: string,
  quoteNumber: string,
  signature: { name: string; ip?: string }
): Promise<Quote | null> {
  const quote = readQuote(dataDir, quoteNumber);
  if (!quote) return null;
  // `paid` is terminal: the public quote link stays valid for weeks, so a
  // late accept/decline must never clobber a recorded payment (#68).
  if (quote.status === "paid") return quote;
  const signedAt = new Date().toISOString();
  const updated: Quote = {
    ...quote,
    status: "accepted",
    acceptedAt: quote.acceptedAt ?? signedAt,
    signature: { name: signature.name, signedAt, ...(signature.ip ? { ip: signature.ip } : {}) },
  };
  writeQuote(dataDir, updated);
  // Signed acceptance receipt next to the quote.
  writeFileAtomic(
    quoteFilePath(dataDir, quoteNumber).replace(/\.json$/, ".receipt.json"),
    JSON.stringify(
      { quoteNumber, total: quote.total, currency: quote.currency, ...updated.signature },
      null,
      2
    )
  );
  await emitEvent(dataDir, "quote.accepted", {
    quoteNumber,
    slug: quote.slug,
    total: quote.total,
    currency: quote.currency,
    signedBy: signature.name,
    signedAt,
  });
  await appendInteraction(dataDir, quote.slug, {
    date: signedAt.slice(0, 10),
    type: "Proposal",
    with: signature.name,
    subject: `Quote ${quoteNumber} accepted`,
    summary: `${signature.name} accepted quote ${quoteNumber} (${quote.total} ${quote.currency}) online.`,
    nextSteps: quote.paymentLinkUrl ? ["Await payment"] : ["Send invoice / payment link"],
    sourceRef: `quote-accept:${quoteNumber}`,
    synced: signedAt,
  }).catch(() => undefined);
  await notify(
    dataDir,
    quote.slug,
    `✅ Quote ${quoteNumber} accepted by ${signature.name} (${quote.total} ${quote.currency})`
  );
  logger.info("quote", "accepted", { quoteNumber, by: signature.name });
  return updated;
}

export async function declineQuote(dataDir: string, quoteNumber: string): Promise<Quote | null> {
  const quote = readQuote(dataDir, quoteNumber);
  if (!quote) return null;
  if (quote.status === "paid") return quote; // terminal — see acceptQuote
  const now = new Date().toISOString();
  const updated: Quote = { ...quote, status: "declined", declinedAt: now };
  writeQuote(dataDir, updated);
  await emitEvent(dataDir, "quote.declined", { quoteNumber, slug: quote.slug });
  await notify(dataDir, quote.slug, `❌ Quote ${quoteNumber} was declined`);
  logger.info("quote", "declined", { quoteNumber });
  return updated;
}

export async function markQuotePaid(dataDir: string, quoteNumber: string): Promise<Quote | null> {
  const quote = readQuote(dataDir, quoteNumber);
  if (!quote) return null;
  if (quote.status === "paid") return quote; // idempotent
  const now = new Date().toISOString();
  const updated: Quote = { ...quote, status: "paid", paidAt: now };
  writeQuote(dataDir, updated);
  await emitEvent(dataDir, "quote.paid", {
    quoteNumber,
    slug: quote.slug,
    total: quote.total,
    currency: quote.currency,
  });
  await appendInteraction(dataDir, quote.slug, {
    date: now.slice(0, 10),
    type: "Proposal",
    with: quote.signature?.name ?? quote.dealName,
    subject: `Quote ${quoteNumber} paid`,
    summary: `Payment received for quote ${quoteNumber} (${quote.total} ${quote.currency}).`,
    nextSteps: ["Kick off delivery"],
    sourceRef: `quote-paid:${quoteNumber}`,
    synced: now,
  }).catch(() => undefined);
  await notify(
    dataDir,
    quote.slug,
    `💰 Quote ${quoteNumber} paid (${quote.total} ${quote.currency})`
  );
  logger.info("quote", "paid", { quoteNumber });
  return updated;
}

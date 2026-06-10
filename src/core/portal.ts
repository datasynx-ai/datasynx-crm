import { createHmac, timingSafeEqual } from "node:crypto";
import { readTickets } from "../fs/ticket-writer.js";
import { searchKbSimple, listKbArticles } from "../fs/knowledge-base.js";
import { appendInteraction } from "../fs/interactions-writer.js";
import { emitEvent } from "./webhooks.js";
import { logger } from "./logger.js";
import type { Ticket } from "../schemas/ticket.js";

/**
 * Customer self-service portal (#58): a magic-link-secured area where a
 * contact sees their own tickets, opens new ones, replies, and searches the
 * PUBLIC knowledge base. The token binds slug + contact email — access is
 * strictly scoped to that customer.
 */

function secret(env: NodeJS.ProcessEnv = process.env): string {
  return env["DXCRM_PORTAL_SECRET"] ?? "dxcrm-portal-default-secret";
}

export interface PortalTokenPayload {
  s: string; // slug
  c: string; // contact email
  exp: number;
}

export function signPortalToken(
  payload: PortalTokenPayload,
  env: NodeJS.ProcessEnv = process.env
): string {
  const body = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const sig = createHmac("sha256", secret(env)).update(body).digest("hex").slice(0, 24);
  return `${body}.${sig}`;
}

export function verifyPortalToken(
  token: string,
  now: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env
): PortalTokenPayload | null {
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
    ) as PortalTokenPayload;
    if (!parsed.s || !parsed.c || typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildPortalLink(
  slug: string,
  contactEmail: string,
  days = 30,
  env: NodeJS.ProcessEnv = process.env
): string {
  const base = (env["DXCRM_SERVER_URL"] ?? "http://localhost:3847").replace(/\/+$/, "");
  const token = signPortalToken(
    { s: slug, c: contactEmail, exp: Date.now() + days * 86_400_000 },
    env
  );
  return `${base}/portal?token=${token}`;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/** Open a new ticket from the portal (auto-routing #59 applies). */
export async function portalCreateTicket(
  dataDir: string,
  scope: { slug: string; contactEmail: string },
  input: { title: string; message?: string }
): Promise<Ticket> {
  const { handleCreateTicket } = await import("../mcp/tools/create-ticket.js");
  const res = await handleCreateTicket(
    {
      slug: scope.slug,
      title: input.title.slice(0, 200),
      ...(input.message ? { description: input.message.slice(0, 2000) } : {}),
    },
    dataDir
  );
  const parsed = JSON.parse(res.content[0]!.text) as { ticket: Ticket };
  const now = new Date().toISOString();
  await appendInteraction(dataDir, scope.slug, {
    date: now.slice(0, 10),
    type: "Note",
    direction: "inbound",
    with: scope.contactEmail,
    subject: `Portal ticket ${parsed.ticket.id}: ${input.title.slice(0, 100)}`,
    summary: input.message?.slice(0, 500) || input.title,
    nextSteps: [],
    sourceRef: `portal:ticket:${parsed.ticket.id}`,
    synced: now,
  }).catch(() => undefined);
  logger.info("portal", "ticket created", { slug: scope.slug, id: parsed.ticket.id });
  return parsed.ticket;
}

/** Reply to one of the customer's own tickets. Returns false for foreign ids. */
export async function portalReply(
  dataDir: string,
  scope: { slug: string; contactEmail: string },
  input: { ticketId: string; message: string }
): Promise<boolean> {
  const own = await readTickets(dataDir, scope.slug);
  const ticket = own.find((t) => t.id === input.ticketId);
  if (!ticket) return false; // strictly scoped: foreign/unknown ids are invisible

  const now = new Date().toISOString();
  await appendInteraction(dataDir, scope.slug, {
    date: now.slice(0, 10),
    type: "Note",
    direction: "inbound",
    with: scope.contactEmail,
    subject: `Portal reply on ${ticket.id}`,
    summary: input.message.slice(0, 1000),
    nextSteps: [],
    sourceRef: `portal:reply:${ticket.id}`,
    synced: now,
  }).catch(() => undefined);
  await emitEvent(dataDir, "ticket.replied", {
    slug: scope.slug,
    ticketId: ticket.id,
    from: scope.contactEmail,
  }).catch(() => undefined);
  logger.info("portal", "ticket reply", { slug: scope.slug, id: ticket.id });
  return true;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function renderPortalHtml(
  dataDir: string,
  scope: { slug: string; contactEmail: string },
  token: string,
  opts: { kbQuery?: string; flash?: string } = {}
): Promise<string> {
  const tickets = await readTickets(dataDir, scope.slug);
  const open = tickets.filter((t) => t.status !== "closed");

  const kbResults = opts.kbQuery
    ? searchKbSimple(dataDir, opts.kbQuery, { publicOnly: true }).slice(0, 5)
    : [];
  const kbCount = listKbArticles(dataDir, { publicOnly: true }).length;

  const ticketRows = open
    .map(
      (t) => `<div class="ticket"><strong>${esc(t.id)}</strong> ${esc(t.title)}
<span class="badge ${esc(t.status)}">${esc(t.status)}</span> <span class="badge">${esc(t.priority)}</span>
${t.slaDue ? `<span class="meta">due ${esc(t.slaDue)}</span>` : ""}
<form method="POST" action="/portal/reply" class="reply">
<input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="ticketId" value="${esc(t.id)}">
<input type="text" name="message" placeholder="Reply…" required> <button type="submit">Send</button>
</form></div>`
    )
    .join("\n");

  const kbList = kbResults
    .map(
      (a) =>
        `<li><strong>${esc(a.title)}</strong><br><span class="meta">${esc(a.body.slice(0, 180))}…</span></li>`
    )
    .join("\n");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Support Portal</title>
<style>body{font-family:Arial,sans-serif;max-width:760px;margin:32px auto;color:#1a1a2e;padding:0 16px}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;background:#eee;font-size:.8em;margin-left:6px}
.badge.open{background:#dbeafe}.badge.in-progress{background:#fef3c7}.badge.waiting{background:#fce7f3}.badge.resolved{background:#dcfce7}
.ticket{padding:12px;border:1px solid #e5e7eb;border-radius:8px;margin:10px 0}.meta{color:#888;font-size:.85em}
input[type=text]{padding:8px;width:60%}button{padding:8px 16px;border:none;border-radius:4px;background:#1a1a2e;color:#fff;cursor:pointer}
.flash{background:#dcfce7;padding:10px;border-radius:6px}</style></head>
<body><h1>Support Portal</h1>
<p class="meta">Signed in as ${esc(scope.contactEmail)}</p>
${opts.flash ? `<p class="flash">${esc(opts.flash)}</p>` : ""}
<h2>Your tickets (${open.length})</h2>
${ticketRows || "<p>No open tickets.</p>"}
<h2>Open a new ticket</h2>
<form method="POST" action="/portal/ticket">
<input type="hidden" name="token" value="${esc(token)}">
<input type="text" name="title" placeholder="Subject" required><br><br>
<input type="text" name="message" placeholder="Describe your issue"><br><br>
<button type="submit">Create ticket</button>
</form>
<h2>Knowledge base (${kbCount} public article${kbCount === 1 ? "" : "s"})</h2>
<form method="GET" action="/portal">
<input type="hidden" name="token" value="${esc(token)}">
<input type="text" name="q" placeholder="Search articles…" value="${esc(opts.kbQuery ?? "")}"> <button type="submit">Search</button>
</form>
${kbResults.length > 0 ? `<ul>${kbList}</ul>` : opts.kbQuery ? "<p>No public articles match.</p>" : ""}
</body></html>`;
}

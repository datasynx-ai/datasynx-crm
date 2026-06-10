import fs from "fs";
import path from "path";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { readJsonFile, writeJsonFile } from "../fs/json-store.js";
import { emitEvent } from "./webhooks.js";
import { logger } from "./logger.js";

/**
 * Native meeting scheduler (#53): a public booking page derives real free
 * slots from the connected calendars (Microsoft Graph / Google), distributes
 * team bookings round-robin across reps, writes a calendar event, and logs a
 * `Meeting` interaction — all without a third-party scheduler. The Calendly
 * `get_booking_link` tool stays as a fallback.
 */

export interface Interval {
  start: number; // epoch ms
  end: number; // epoch ms
}

export interface BookingPage {
  id: string;
  title: string;
  /** Reps the bookings round-robin across (RBAC actor names). */
  reps: string[];
  /** Slot length in minutes. */
  durationMin: number;
  /** Required gap (minutes) before/after a meeting. */
  bufferMin: number;
  /** How many calendar days ahead to offer (starting today). */
  days: number;
  /** Working hours, interpreted in UTC, [startHour, endHour). */
  startHour: number;
  endHour: number;
  /** Slot granularity in minutes (defaults to durationMin). */
  slotStepMin: number;
  /** Customer slug to log the interaction against; falls back to email-domain routing. */
  slug?: string;
  location?: string;
  createdAt: string;
  /** Persisted round-robin cursor. */
  rrIndex: number;
}

export interface Slot {
  start: number;
  end: number;
  /** Reps that are free for this slot. */
  reps: string[];
}

// ─── Store ──────────────────────────────────────────────────────────────────

function pagesDir(dataDir: string): string {
  return path.join(dataDir, ".agentic", "booking-pages");
}
function pagePath(dataDir: string, id: string): string {
  return path.join(pagesDir(dataDir), `${id}.json`);
}

export function listBookingPages(dataDir: string): BookingPage[] {
  const dir = pagesDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      const p = readJsonFile<BookingPage | null>(path.join(dir, f), null);
      return p?.id ? [p] : [];
    });
}

export function getBookingPage(dataDir: string, id: string): BookingPage | null {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return null;
  return readJsonFile<BookingPage | null>(pagePath(dataDir, id), null);
}

export function writeBookingPage(dataDir: string, page: BookingPage): void {
  writeJsonFile(pagePath(dataDir, page.id), page);
}

export interface CreateBookingPageInput {
  id: string;
  title: string;
  reps: string[];
  durationMin?: number;
  bufferMin?: number;
  days?: number;
  startHour?: number;
  endHour?: number;
  slotStepMin?: number;
  slug?: string;
  location?: string;
}

export function createBookingPage(dataDir: string, input: CreateBookingPageInput): BookingPage {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(input.id)) {
    throw new Error("Booking page id must be lowercase alphanumeric/hyphens.");
  }
  if (!input.reps || input.reps.length === 0) {
    throw new Error("A booking page needs at least one rep.");
  }
  const duration = input.durationMin ?? 30;
  const page: BookingPage = {
    id: input.id,
    title: input.title,
    reps: input.reps,
    durationMin: duration,
    bufferMin: input.bufferMin ?? 0,
    days: input.days ?? 14,
    startHour: input.startHour ?? 9,
    endHour: input.endHour ?? 17,
    slotStepMin: input.slotStepMin ?? duration,
    ...(input.slug ? { slug: input.slug } : {}),
    ...(input.location ? { location: input.location } : {}),
    createdAt: new Date().toISOString(),
    rrIndex: 0,
  };
  writeBookingPage(dataDir, page);
  logger.info("booking", "page created", { id: page.id, reps: page.reps.length });
  return page;
}

// ─── Token (signed embed links) ───────────────────────────────────────────────

function secret(env: NodeJS.ProcessEnv = process.env): string {
  return env["DXCRM_BOOKING_SECRET"] ?? "dxcrm-booking-default-secret";
}

export interface BookingTokenPayload {
  p: string; // page id
  exp: number;
}

export function signBookingToken(
  payload: BookingTokenPayload,
  env: NodeJS.ProcessEnv = process.env
): string {
  const body = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const sig = createHmac("sha256", secret(env)).update(body).digest("hex").slice(0, 24);
  return `${body}.${sig}`;
}

export function verifyBookingToken(
  token: string,
  now: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env
): BookingTokenPayload | null {
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
    ) as BookingTokenPayload;
    if (!parsed.p || typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildBookingLink(pageId: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = (env["DXCRM_SERVER_URL"] ?? "http://localhost:3847").replace(/\/+$/, "");
  return `${base}/book/${pageId}`;
}

// ─── Availability (pure) ───────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

/**
 * Generate the offered slots for a page given each rep's busy intervals. A slot
 * is offered when at least one rep has no overlap (including the configured
 * buffer). Past slots are dropped. Working hours are interpreted in UTC.
 */
export function availableSlots(
  page: BookingPage,
  busyByRep: Record<string, Interval[]>,
  now: number = Date.now()
): Slot[] {
  const slots: Slot[] = [];
  const stepMin = page.slotStepMin || page.durationMin;
  const durMs = page.durationMin * MIN_MS;
  const bufMs = page.bufferMin * MIN_MS;
  const firstMidnight = Math.floor(now / DAY_MS) * DAY_MS;

  for (let day = 0; day < page.days; day++) {
    const midnight = firstMidnight + day * DAY_MS;
    for (let m = page.startHour * 60; m + page.durationMin <= page.endHour * 60; m += stepMin) {
      const start = midnight + m * MIN_MS;
      const end = start + durMs;
      if (start <= now) continue;
      const reps = page.reps.filter((rep) => {
        const busy = busyByRep[rep] ?? [];
        return !busy.some((b) => b.start < end + bufMs && b.end > start - bufMs);
      });
      if (reps.length > 0) slots.push({ start, end, reps });
    }
  }
  return slots;
}

/**
 * Round-robin selection across the reps that are free for a slot. Advances the
 * cursor past the chosen rep; busy reps are skipped without consuming a turn.
 */
export function pickRep(
  page: Pick<BookingPage, "reps" | "rrIndex">,
  freeReps: string[]
): { rep: string; rrIndex: number } {
  const n = page.reps.length;
  for (let i = 0; i < n; i++) {
    const idx = (page.rrIndex + i) % n;
    const rep = page.reps[idx]!;
    if (freeReps.includes(rep)) return { rep, rrIndex: (idx + 1) % n };
  }
  return { rep: freeReps[0] ?? page.reps[0]!, rrIndex: page.rrIndex };
}

// ─── Booking ────────────────────────────────────────────────────────────────

export interface BookingInput {
  start: number; // epoch ms of the chosen slot
  name: string;
  email: string;
  notes?: string;
}

export interface BookingDeps {
  now?: number;
  getBusy?: (reps: string[], range: Interval) => Promise<Record<string, Interval[]>>;
  createEvent?: (
    rep: string,
    ev: { start: number; end: number; title: string; name: string; email: string }
  ) => Promise<string | null>;
}

export interface BookingResult {
  bookingId: string;
  rep: string;
  start: number;
  end: number;
  slug: string | null;
  externalEventId: string | null;
}

function appendBookingRecord(dataDir: string, record: Record<string, unknown>): void {
  const file = path.join(dataDir, ".agentic", "bookings.ndjson");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(record) + "\n");
}

/**
 * Confirm a booking for a specific slot: pick a free rep round-robin, write a
 * calendar event (best-effort), log a Meeting interaction, and emit
 * `meeting.booked`. Returns null when the requested slot is no longer available.
 */
export async function createBooking(
  dataDir: string,
  page: BookingPage,
  input: BookingInput,
  deps: BookingDeps = {}
): Promise<BookingResult | null> {
  const now = deps.now ?? Date.now();
  const range: Interval = { start: now, end: now + page.days * DAY_MS };

  const getBusy =
    deps.getBusy ??
    (async (reps: string[], r: Interval) => {
      const { getBusyIntervals } = await import("../sync/calendar-availability.js");
      return getBusyIntervals(dataDir, reps, r);
    });
  const createEvent =
    deps.createEvent ??
    (async (
      rep: string,
      ev: { start: number; end: number; title: string; name: string; email: string }
    ) => {
      const { createCalendarEvent } = await import("../sync/calendar-availability.js");
      return createCalendarEvent(dataDir, rep, ev);
    });

  const busyByRep = await getBusy(page.reps, range);
  const slots = availableSlots(page, busyByRep, now);
  const slot = slots.find((s) => s.start === input.start);
  if (!slot) return null;

  const { rep, rrIndex } = pickRep(page, slot.reps);
  // Persist the advanced cursor so the next booking goes to the next rep.
  const stored = getBookingPage(dataDir, page.id) ?? page;
  writeBookingPage(dataDir, { ...stored, rrIndex });

  const bookingId = `B-${randomUUID().slice(0, 8)}`;
  const title = `${page.title} — ${input.name}`;

  const externalEventId = await createEvent(rep, {
    start: slot.start,
    end: slot.end,
    title,
    name: input.name,
    email: input.email,
  }).catch(() => null);

  // Resolve the customer: explicit page slug wins, else route by email domain.
  let slug = page.slug ?? null;
  if (!slug) {
    const { buildRoutingTable, routeMessage } = await import("../sync/email-router.js");
    slug = routeMessage([input.email], buildRoutingTable(dataDir));
  }

  appendBookingRecord(dataDir, {
    bookingId,
    pageId: page.id,
    rep,
    start: slot.start,
    end: slot.end,
    name: input.name,
    email: input.email,
    notes: input.notes ?? "",
    slug,
    externalEventId,
    createdAt: new Date(now).toISOString(),
  });

  if (slug) {
    const { appendInteraction } = await import("../fs/interactions-writer.js");
    const startIso = new Date(slot.start).toISOString();
    await appendInteraction(dataDir, slug, {
      date: startIso.slice(0, 10),
      type: "Meeting",
      direction: "inbound",
      with: `${input.name} <${input.email}>`,
      subject: `Booking ${bookingId}: ${page.title}`,
      summary: `Meeting booked with ${rep} for ${startIso}${input.notes ? ` — ${input.notes}` : ""}.`,
      nextSteps: ["Prepare for the meeting"],
      sourceRef: `booking:${bookingId}`,
      synced: new Date(now).toISOString(),
    }).catch(() => undefined);
  }

  await emitEvent(dataDir, "meeting.booked", {
    slug: slug ?? "",
    pageId: page.id,
    bookingId,
    rep,
    start: slot.start,
    end: slot.end,
    name: input.name,
    email: input.email,
    externalEventId,
  }).catch(() => undefined);

  logger.info("booking", "booked", { bookingId, pageId: page.id, rep, slug });
  return { bookingId, rep, start: slot.start, end: slot.end, slug, externalEventId };
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtSlot(ms: number): string {
  const d = new Date(ms);
  return d.toUTCString().replace(":00 GMT", " UTC");
}

export function renderBookingHtml(
  page: BookingPage,
  slots: Slot[],
  opts: { flash?: string } = {}
): string {
  const byDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const day = new Date(s.start).toUTCString().slice(0, 16);
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(s);
  }
  const slotGroups = [...byDay.entries()]
    .map(
      ([day, ss]) => `<div class="day"><h3>${esc(day)}</h3>
${ss
  .map(
    (s) =>
      `<label class="slot"><input type="radio" name="start" value="${s.start}" required> ${esc(fmtSlot(s.start))}</label>`
  )
  .join("\n")}</div>`
    )
    .join("\n");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(page.title)}</title>
<style>body{font-family:Arial,sans-serif;max-width:680px;margin:32px auto;color:#1a1a2e;padding:0 16px}
.day{margin:14px 0}.slot{display:inline-block;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;margin:4px;cursor:pointer}
.flash{background:#dcfce7;padding:10px;border-radius:6px}input[type=text],input[type=email]{padding:8px;width:60%}
button{padding:10px 18px;border:none;border-radius:6px;background:#1a1a2e;color:#fff;cursor:pointer;margin-top:12px}
.meta{color:#888;font-size:.85em}</style></head>
<body><h1>${esc(page.title)}</h1>
<p class="meta">${page.durationMin} min${page.location ? " · " + esc(page.location) : ""} · times in UTC</p>
${opts.flash ? `<p class="flash">${esc(opts.flash)}</p>` : ""}
<form method="POST" action="/book/${esc(page.id)}">
<h2>Pick a time (${slots.length} available)</h2>
${slotGroups || "<p>No free slots in the current window. Please check back later.</p>"}
<h2>Your details</h2>
<input type="text" name="name" placeholder="Your name" required><br><br>
<input type="email" name="email" placeholder="you@company.com" required><br><br>
<input type="text" name="notes" placeholder="Anything we should know? (optional)"><br>
<button type="submit">Confirm booking</button>
</form></body></html>`;
}

export function renderConfirmedHtml(page: BookingPage, res: BookingResult): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Booking confirmed</title>
<style>body{font-family:Arial,sans-serif;max-width:560px;margin:48px auto;color:#1a1a2e;padding:0 16px;text-align:center}
.ok{font-size:3em}</style></head>
<body><div class="ok">✅</div><h1>You're booked!</h1>
<p>${esc(page.title)} with <strong>${esc(res.rep)}</strong></p>
<p>${esc(fmtSlot(res.start))}</p>
<p class="meta">Confirmation ${esc(res.bookingId)}</p></body></html>`;
}

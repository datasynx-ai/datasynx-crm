import { calendar as calendarApi } from "@googleapis/calendar";
import type { OAuth2Client } from "google-auth-library";
import { appendInteraction } from "../fs/interactions-writer.js";

interface CalendarSyncOptions {
  slug: string;
  dataDir: string;
  auth: OAuth2Client;
  since?: Date;
}

export async function syncCalendar(
  opts: CalendarSyncOptions
): Promise<{ synced: number; skipped: number }> {
  const calendar = calendarApi({ version: "v3", auth: opts.auth });

  const timeMin =
    opts.since?.toISOString() ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const listResp = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    maxResults: 100,
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = listResp.data.items ?? [];

  let synced = 0;
  let skipped = 0;

  for (const event of events) {
    if (!event.id) continue;

    const source = `gcal://event/${event.id}`;

    const { readInteractions } = await import("../fs/interactions-writer.js");
    const existing = await readInteractions(opts.dataDir, opts.slug);
    if (existing.includes(source)) {
      skipped++;
      continue;
    }

    const startDateTime = event.start?.dateTime ?? event.start?.date ?? new Date().toISOString();
    const date = new Date(startDateTime).toISOString().slice(0, 10);
    const summary = event.summary ?? "(no title)";
    const description = event.description ?? "";
    const attendees = (event.attendees ?? [])
      .map((a) => a.email ?? "")
      .filter(Boolean)
      .join(", ");

    await appendInteraction(opts.dataDir, opts.slug, {
      date,
      type: "Meeting",
      with: attendees || "unknown",
      subject: summary,
      summary: description.slice(0, 300) || `Calendar event: ${summary}`,
      nextSteps: [],
      sourceRef: source,
      synced: new Date().toISOString(),
    });

    synced++;
  }

  return { synced, skipped };
}

import { appendInteraction } from "../fs/interactions-writer.js";
import { updateSlugSyncState } from "../fs/sync-state.js";

export interface CalendarSyncOptions {
  slug: string;
  dataDir: string;
  accessToken: string;
  since?: Date;
  maxResults?: number;
}

export interface CalendarSyncResult {
  synced: number;
  skipped: number;
  errors: string[];
}

interface GraphEvent {
  id: string;
  subject?: string;
  bodyPreview?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  attendees?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  organizer?: { emailAddress?: { name?: string; address?: string } };
}

interface GraphEventsResponse {
  value: GraphEvent[];
  "@odata.nextLink"?: string;
}

export async function syncMicrosoftCalendar(opts: CalendarSyncOptions): Promise<CalendarSyncResult> {
  const result: CalendarSyncResult = { synced: 0, skipped: 0, errors: [] };
  const since = opts.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const until = new Date();
  const top = opts.maxResults ?? 50;

  const startStr = since.toISOString();
  const endStr = until.toISOString();

  const { readInteractions } = await import("../fs/interactions-writer.js");
  const existing = await readInteractions(opts.dataDir, opts.slug).catch(() => "");

  let url: string | undefined = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${startStr}&endDateTime=${endStr}&$top=${top}&$select=id,subject,bodyPreview,start,end,attendees,organizer`;

  while (url) {
    let events: GraphEvent[];
    let nextLink: string | undefined;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${opts.accessToken}` },
      });
      if (!res.ok) {
        result.errors.push(`Graph Calendar API error: ${res.status} ${res.statusText}`);
        break;
      }
      const data = (await res.json()) as GraphEventsResponse;
      events = data.value ?? [];
      nextLink = data["@odata.nextLink"];
    } catch (err) {
      result.errors.push(`Network error: ${(err as Error).message}`);
      break;
    }

    for (const event of events) {
      const sourceRef = `microsoft://calendar/${event.id}`;
      if (existing.includes(sourceRef)) {
        result.skipped++;
        continue;
      }

      const date = event.start?.dateTime
        ? new Date(event.start.dateTime).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      const attendeeNames = (event.attendees ?? [])
        .map((a) => a.emailAddress?.name ?? a.emailAddress?.address ?? "unknown")
        .join(", ");

      const organizer =
        event.organizer?.emailAddress?.name ??
        event.organizer?.emailAddress?.address ??
        "unknown";

      try {
        await appendInteraction(opts.dataDir, opts.slug, {
          date,
          type: "Meeting",
          with: attendeeNames || organizer,
          summary: `${event.subject ?? "(no subject)"}: ${event.bodyPreview?.slice(0, 200) ?? ""}`,
          nextSteps: [],
          sourceRef,
          synced: new Date().toISOString(),
          direction: "inbound",
        });
        result.synced++;
      } catch (err) {
        result.errors.push(`Failed to append ${event.id}: ${(err as Error).message}`);
      }
    }

    url = nextLink;
  }

  if (result.synced > 0) {
    updateSlugSyncState(opts.dataDir, opts.slug, {
      lastGmailSync: new Date().toISOString(),
    });
  }

  return result;
}

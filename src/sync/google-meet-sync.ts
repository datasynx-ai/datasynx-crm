import { appendInteraction } from "../fs/interactions-writer.js";

export interface MeetSyncOptions {
  conferenceRecordId: string;
  slug: string;
  dataDir: string;
  accessToken: string;
}

interface TranscriptEntry {
  name: string;
  text?: string;
  startTime?: string;
  participantSession?: { participant?: { signedinUser?: { displayName?: string } } };
}

interface TranscriptEntriesResponse {
  transcriptEntries?: TranscriptEntry[];
  nextPageToken?: string;
}

export async function syncGoogleMeetTranscript(opts: MeetSyncOptions): Promise<{
  synced: boolean;
  error?: string;
}> {
  // First, list transcripts for the conference record
  const transcriptsUrl = `https://meet.googleapis.com/v2/${opts.conferenceRecordId}/transcripts`;

  let transcriptName: string | undefined;
  try {
    const res = await fetch(transcriptsUrl, {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    });
    if (!res.ok) return { synced: false, error: `Meet API error: ${res.status}` };
    const data = (await res.json()) as { transcripts?: Array<{ name: string }> };
    transcriptName = data.transcripts?.[0]?.name;
  } catch (err) {
    return { synced: false, error: (err as Error).message };
  }

  if (!transcriptName) return { synced: false };

  const sourceRef = `google://meet/transcript/${transcriptName}`;
  const { readInteractions } = await import("../fs/interactions-writer.js");
  const existing = await readInteractions(opts.dataDir, opts.slug).catch(() => "");
  if (existing.includes(sourceRef)) return { synced: false };

  // Fetch transcript entries
  const entriesUrl = `https://meet.googleapis.com/v2/${transcriptName}/entries`;
  let allEntries: TranscriptEntry[] = [];
  let pageToken: string | undefined;

  do {
    const url = pageToken ? `${entriesUrl}?pageToken=${pageToken}` : entriesUrl;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${opts.accessToken}` },
      });
      if (!res.ok) { break; }
      const data = (await res.json()) as TranscriptEntriesResponse;
      allEntries = allEntries.concat(data.transcriptEntries ?? []);
      pageToken = data.nextPageToken;
    } catch {
      break;
    }
  } while (pageToken);

  const fullText = allEntries
    .map((e) => {
      const speaker = e.participantSession?.participant?.signedinUser?.displayName ?? "speaker";
      return `${speaker}: ${e.text ?? ""}`;
    })
    .join("\n");

  const date = allEntries[0]?.startTime
    ? new Date(allEntries[0].startTime).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  try {
    await appendInteraction(opts.dataDir, opts.slug, {
      date,
      type: "Meeting",
      with: "Google Meet",
      summary: fullText.slice(0, 500),
      nextSteps: [],
      sourceRef,
      synced: new Date().toISOString(),
    });
    return { synced: true };
  } catch (err) {
    return { synced: false, error: (err as Error).message };
  }
}

import { appendInteraction } from "../fs/interactions-writer.js";

export interface TeamsTranscriptOptions {
  userId: string;
  meetingId: string;
  slug: string;
  dataDir: string;
  accessToken: string;
}

interface TranscriptEntry {
  id: string;
  text?: string;
  createdDateTime?: string;
  participant?: { user?: { displayName?: string } };
}

interface TranscriptsResponse {
  value: Array<{ id: string; createdDateTime?: string }>;
}

interface TranscriptEntriesResponse {
  value: TranscriptEntry[];
}

export async function syncTeamsTranscript(opts: TeamsTranscriptOptions): Promise<{
  synced: boolean;
  error?: string;
}> {
  // List transcripts for meeting
  const transcriptsUrl = `https://graph.microsoft.com/v1.0/users/${opts.userId}/onlineMeetings/${opts.meetingId}/transcripts`;

  let transcripts: Array<{ id: string; createdDateTime?: string }>;
  try {
    const res = await fetch(transcriptsUrl, {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    });
    if (!res.ok) return { synced: false, error: `Graph error: ${res.status}` };
    const data = (await res.json()) as TranscriptsResponse;
    transcripts = data.value ?? [];
  } catch (err) {
    return { synced: false, error: (err as Error).message };
  }

  if (transcripts.length === 0) return { synced: false };

  // Fetch the most recent transcript content
  const latest = transcripts[transcripts.length - 1]!;
  const entriesUrl = `https://graph.microsoft.com/v1.0/users/${opts.userId}/onlineMeetings/${opts.meetingId}/transcripts/${latest.id}/entries`;

  let entries: TranscriptEntry[];
  try {
    const res = await fetch(entriesUrl, {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    });
    if (!res.ok) return { synced: false, error: `Transcript entries error: ${res.status}` };
    const data = (await res.json()) as TranscriptEntriesResponse;
    entries = data.value ?? [];
  } catch (err) {
    return { synced: false, error: (err as Error).message };
  }

  const fullText = entries
    .map((e) => `${e.participant?.user?.displayName ?? "speaker"}: ${e.text ?? ""}`)
    .join("\n");

  const date = latest.createdDateTime
    ? new Date(latest.createdDateTime).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const sourceRef = `microsoft://teams/transcript/${latest.id}`;

  const { readInteractions } = await import("../fs/interactions-writer.js");
  const existing = await readInteractions(opts.dataDir, opts.slug).catch(() => "");
  if (existing.includes(sourceRef)) return { synced: false };

  try {
    await appendInteraction(opts.dataDir, opts.slug, {
      date,
      type: "Meeting",
      with: "Teams Meeting",
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

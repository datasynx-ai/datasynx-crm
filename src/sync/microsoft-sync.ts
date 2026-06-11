import { appendInteraction } from "../fs/interactions-writer.js";
import { updateSlugSyncState } from "../fs/sync-state.js";

export interface MicrosoftSyncOptions {
  slug: string;
  dataDir: string;
  accessToken: string;
  query?: string;
  since?: Date;
  maxResults?: number;
}

export interface MicrosoftSyncResult {
  synced: number;
  skipped: number;
  errors: string[];
}

interface GraphMessage {
  id: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
}

interface GraphResponse {
  value: GraphMessage[];
}

export async function syncMicrosoft(opts: MicrosoftSyncOptions): Promise<MicrosoftSyncResult> {
  const result: MicrosoftSyncResult = { synced: 0, skipped: 0, errors: [] };
  const maxResults = opts.maxResults ?? 50;

  let filter = "";
  if (opts.since) {
    filter = `&$filter=receivedDateTime ge ${opts.since.toISOString()}`;
  }
  if (opts.query) {
    filter += (filter ? " and " : "&$filter=") + opts.query;
  }

  const url = `https://graph.microsoft.com/v1.0/me/messages?$top=${maxResults}${filter}`;

  let messages: GraphMessage[];
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    });
    if (!res.ok) {
      result.errors.push(`Graph API error: ${res.status} ${res.statusText}`);
      return result;
    }
    const data = (await res.json()) as GraphResponse;
    messages = data.value ?? [];
  } catch (err) {
    result.errors.push(`Network error: ${(err as Error).message}`);
    return result;
  }

  const { readInteractions } = await import("../fs/interactions-writer.js");
  const existing = await readInteractions(opts.dataDir, opts.slug).catch(() => "");

  for (const msg of messages) {
    const sourceRef = `microsoft://message/${msg.id}`;
    if (existing.includes(sourceRef)) {
      result.skipped++;
      continue;
    }

    const date = msg.receivedDateTime
      ? new Date(msg.receivedDateTime).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const from = msg.from?.emailAddress?.name ?? msg.from?.emailAddress?.address ?? "unknown";
    const subject = msg.subject ?? "(no subject)";
    const preview = msg.bodyPreview ?? "";

    let summary = preview.slice(0, 300);
    let nextSteps: string[] = [];

    try {
      const { summarizeEmail } = await import("../core/llm.js");
      const { resolveTone, languageName } = await import("../core/tone.js");
      const summaryLang = languageName(resolveTone(opts.dataDir).language);
      const llmResult = await summarizeEmail(subject, preview, from, summaryLang);
      summary = llmResult.summary;
      nextSteps = llmResult.nextSteps;
    } catch {
      // LLM unavailable — use raw preview
    }

    try {
      await appendInteraction(opts.dataDir, opts.slug, {
        date,
        type: "Email",
        with: from,
        summary: `${subject}: ${summary}`,
        nextSteps,
        sourceRef,
        synced: new Date().toISOString(),
      });
      result.synced++;
    } catch (err) {
      result.errors.push(`Failed to append ${msg.id}: ${(err as Error).message}`);
    }
  }

  if (result.synced > 0) {
    updateSlugSyncState(opts.dataDir, opts.slug, {
      lastGmailSync: new Date().toISOString(),
    });
  }

  return result;
}

// src/sync/gmail-sync.ts
import { google, type Auth } from "googleapis";
import { appendInteraction } from "../fs/interactions-writer.js";

interface SyncOptions {
  slug: string;
  dataDir: string;
  auth: Auth.OAuth2Client;
  query: string;
  since?: Date;
}

export async function syncGmail(opts: SyncOptions): Promise<{ synced: number; skipped: number }> {
  const gmail = google.gmail({ version: "v1", auth: opts.auth });

  let q = opts.query;
  if (opts.since) {
    const after = Math.floor(opts.since.getTime() / 1000);
    q += ` after:${after}`;
  }

  const listResp = await gmail.users.messages.list({ userId: "me", q, maxResults: 200 });
  const messages = listResp.data.messages ?? [];

  let synced = 0;
  let skipped = 0;

  for (const msg of messages) {
    if (!msg.id) continue;

    const source = `gmail://thread/${msg.threadId ?? msg.id}`;

    // Check idempotency — skip if source already in interactions
    const { readInteractions } = await import("../fs/interactions-writer.js");
    const existing = await readInteractions(opts.dataDir, opts.slug);
    if (existing.includes(source)) {
      skipped++;
      continue;
    }

    // Rate limiting ~10 req/s
    await sleep(100);

    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Date"],
    });

    const headers = detail.data.payload?.headers ?? [];
    const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
    const from = headers.find((h) => h.name === "From")?.value ?? "";
    const dateStr = headers.find((h) => h.name === "Date")?.value;
    const date = dateStr ? new Date(dateStr).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const snippet = detail.data.snippet ?? "";

    await appendInteraction(opts.dataDir, opts.slug, {
      date,
      type: "Email",
      direction: detectDirection(from),
      with: from,
      subject,
      summary: snippet.slice(0, 300),
      nextSteps: [],
      sourceRef: source,
      synced: new Date().toISOString(),
    });

    // Index into LanceDB for semantic search (non-blocking — don't fail sync if this fails)
    const { indexInLanceDB } = await import("../core/lancedb.js");
    await indexInLanceDB(opts.dataDir, opts.slug, `${subject}\n${snippet}`, source, {
      date,
      type: "Email",
    }).catch((err: unknown) => {
      process.stderr.write(`[gmail-sync] LanceDB index failed: ${(err as Error).message}\n`);
    });

    synced++;
  }

  return { synced, skipped };
}

function detectDirection(from: string): "inbound" | "outbound" {
  // Heuristic: if from contains common personal indicators it may be outbound
  // Actual detection requires knowing the user's own email
  return "inbound";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

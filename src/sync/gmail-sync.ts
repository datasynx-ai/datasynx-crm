// src/sync/gmail-sync.ts
import fs from "fs";
import path from "path";
import { gmail as gmailApi, type gmail_v1 } from "@googleapis/gmail";
import type { OAuth2Client } from "google-auth-library";
import { readInteractions, appendInteraction } from "../fs/interactions-writer.js";
import { notifyAgentWake } from "../core/agent-notifier.js";
import { logger } from "../core/logger.js";

interface SyncOptions {
  slug: string;
  dataDir: string;
  auth: OAuth2Client;
  query: string;
  since?: Date;
  maxPages?: number;
}

/**
 * Retry a function with exponential backoff on any error.
 * Delays: 1s, 2s, 4s, 8s … (2^attempt seconds), up to maxRetries retries.
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      const delayMs = 1000 * Math.pow(2, attempt);
      await sleep(delayMs);
      attempt++;
    }
  }
}

export async function syncGmail(opts: SyncOptions): Promise<{ synced: number; skipped: number }> {
  const gmail = gmailApi({ version: "v1", auth: opts.auth });
  const maxPages = opts.maxPages ?? 5;

  let q = opts.query;
  if (opts.since) {
    const after = Math.floor(opts.since.getTime() / 1000);
    q += ` after:${after}`;
  }

  // Collect all message stubs across pages (Task A — pagination)
  const allMessages: Array<{ id?: string | null; threadId?: string | null }> = [];
  let pageToken: string | undefined = undefined;
  let pagesFetched = 0;

  do {
    const listResp: { data: gmail_v1.Schema$ListMessagesResponse } =
      await gmail.users.messages.list({
        userId: "me",
        q,
        maxResults: 200,
        ...(pageToken ? { pageToken } : {}),
      });
    const pageMessages = listResp.data.messages ?? [];
    allMessages.push(...pageMessages);
    pageToken = listResp.data.nextPageToken ?? undefined;
    pagesFetched++;
  } while (pageToken && pagesFetched < maxPages);

  // Read existing interactions once before the loop — avoids O(messages) file reads
  let existingContent = await readInteractions(opts.dataDir, opts.slug);

  let synced = 0;
  let skipped = 0;

  for (const msg of allMessages) {
    if (!msg.id) continue;

    const source = `gmail://thread/${msg.threadId ?? msg.id}`;

    if (existingContent.includes(source)) {
      skipped++;
      continue;
    }

    // Rate limiting ~10 req/s
    await sleep(100);

    // Task B — exponential backoff retry on any error
    let msgData: gmail_v1.Schema$Message;
    try {
      const detail = await retryWithBackoff(() =>
        gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"],
        })
      );
      msgData = detail.data;
    } catch (err) {
      logger.warn("gmail-sync", "skipping message after retries", {
        messageId: msg.id,
        error: (err as Error).message,
      });
      skipped++;
      continue;
    }

    const headers = msgData.payload?.headers ?? [];
    const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
    const from = headers.find((h) => h.name === "From")?.value ?? "";
    const dateStr = headers.find((h) => h.name === "Date")?.value;
    const date = dateStr
      ? new Date(dateStr).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const snippet = msgData.snippet ?? "";

    // LLM summary — non-blocking fallback to raw snippet if no API key or error
    const { summarizeEmail } = await import("../core/llm.js");
    const emailSummary = await summarizeEmail(subject, snippet, from);

    await appendInteraction(opts.dataDir, opts.slug, {
      date,
      type: "Email",
      direction: detectDirection(from),
      with: from,
      subject,
      summary: emailSummary.summary,
      nextSteps: emailSummary.nextSteps,
      sourceRef: source,
      synced: new Date().toISOString(),
    });

    // Append to in-memory string so within-batch duplicates are detected
    existingContent += source;

    // Index into LanceDB for semantic search (non-blocking)
    const { indexInLanceDB } = await import("../core/lancedb.js");
    await indexInLanceDB(opts.dataDir, opts.slug, `${subject}\n${snippet}`, source, {
      date,
      type: "Email",
    }).catch((err: unknown) => {
      logger.error("gmail-sync", "LanceDB index failed", { error: (err as Error).message });
    });

    // Agent wake: notify if an agent config exists for this customer (fire-and-forget)
    if (agentConfigExists(opts.dataDir, opts.slug)) {
      notifyAgentWake(opts.dataDir, opts.slug, {
        trigger: "email",
        subject,
        from,
        snippet,
      }).catch(() => {
        // Notification is non-blocking; swallow all errors
      });
    }

    synced++;
  }

  return { synced, skipped };
}

function agentConfigExists(dataDir: string, slug: string): boolean {
  const configPath = path.join(dataDir, ".agentic", "agents", `${slug}.agent.json`);
  return fs.existsSync(configPath);
}

function detectDirection(_from: string): "inbound" | "outbound" {
  return "inbound";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/sync/email-ingest.ts
import { appendInteraction } from "../fs/interactions-writer.js";
import { persistAttachment, DEFAULT_MAX_ATTACHMENT_BYTES } from "./attachments.js";
import { chunkText } from "../core/chunk.js";
import { logger } from "../core/logger.js";

/** An attachment with its bytes already in hand (no provider fetch needed). */
export interface NormalizedAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

/**
 * A provider-independent email, normalized from Gmail / IMAP / Graph into a
 * single shape so the downstream pipeline (summary, attachments→Markdown,
 * indexing, interaction log) is written once and reused everywhere.
 */
export interface NormalizedEmail {
  /** Stable id for dedup and as the attachment filename prefix. */
  messageId: string;
  /** Raw `From` header value (display name + address). */
  from: string;
  /** Recipient addresses (to + cc), lowercased. */
  toAddresses: string[];
  subject: string;
  /** Message date as YYYY-MM-DD. */
  date: string;
  /** Body already rendered to Markdown (plain verbatim or HTML→MD). */
  bodyMarkdown: string;
  attachments: NormalizedAttachment[];
  /** Canonical source ref, e.g. `imap://user@host/INBOX/42`. */
  sourceRef: string;
}

export interface IngestOptions {
  includeAttachments?: boolean;
  maxAttachmentBytes?: number;
  direction?: "inbound" | "outbound";
}

/**
 * Ingest one normalized email into a customer: convert + index its
 * attachments, summarize it, append the interaction (with attachment links),
 * and index the full body (chunked) for semantic search. Caller is responsible
 * for deduplication (skip messages whose sourceRef is already logged).
 */
export async function ingestEmail(
  dataDir: string,
  slug: string,
  msg: NormalizedEmail,
  options: IngestOptions = {}
): Promise<{ attachments: number; chunks: number }> {
  const includeAttachments = options.includeAttachments ?? true;
  const maxBytes = options.maxAttachmentBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES;

  // Attachments first, so the interaction entry can link to the Markdown.
  const attachmentLinks: string[] = [];
  if (includeAttachments) {
    for (const att of msg.attachments) {
      if (att.content.length > maxBytes) {
        logger.warn("email-ingest", "skipping oversized attachment", {
          filename: att.filename,
          bytes: att.content.length,
        });
        continue;
      }
      try {
        const saved = await persistAttachment({
          dataDir,
          slug,
          messageId: msg.messageId,
          source: msg.sourceRef,
          date: msg.date,
          filename: att.filename,
          mimeType: att.mimeType,
          buffer: att.content,
        });
        attachmentLinks.push(saved.markdownName);
      } catch (err) {
        logger.warn("email-ingest", "attachment failed", {
          filename: att.filename,
          error: (err as Error).message,
        });
      }
    }
  }

  // LLM summary — non-blocking fallback to the raw body when no API key.
  // Summary language follows the operator's configured tone (default English).
  const { summarizeEmail } = await import("../core/llm.js");
  const { resolveTone, languageName } = await import("../core/tone.js");
  const summaryLang = languageName(resolveTone(dataDir).language);
  const summary = await summarizeEmail(msg.subject, msg.bodyMarkdown, msg.from, summaryLang);

  await appendInteraction(dataDir, slug, {
    date: msg.date,
    type: "Email",
    direction: options.direction ?? "inbound",
    with: msg.from,
    subject: msg.subject,
    summary: summary.summary,
    nextSteps: summary.nextSteps,
    ...(attachmentLinks.length > 0 ? { attachments: attachmentLinks } : {}),
    sourceRef: msg.sourceRef,
    synced: new Date().toISOString(),
  });

  // Index the full email (subject + body), chunked for long threads.
  const { indexInLanceDB } = await import("../core/lancedb.js");
  const bodyChunks = chunkText(`${msg.subject}\n${msg.bodyMarkdown}`);
  for (let i = 0; i < bodyChunks.length; i++) {
    const ref = i === 0 ? msg.sourceRef : `${msg.sourceRef}#${i}`;
    await indexInLanceDB(dataDir, slug, bodyChunks[i]!, ref, {
      date: msg.date,
      type: "Email",
    }).catch((err: unknown) => {
      logger.error("email-ingest", "LanceDB index failed", { error: (err as Error).message });
    });
  }

  return { attachments: attachmentLinks.length, chunks: bodyChunks.length };
}

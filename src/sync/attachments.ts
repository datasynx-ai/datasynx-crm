// src/sync/attachments.ts
import fs from "fs";
import path from "path";
import type { gmail_v1 } from "@googleapis/gmail";
import { convertAttachment } from "./converters/registry.js";
import { chunkText } from "../core/chunk.js";
import { assertSafeSlug } from "../fs/customer-dir.js";
import { logger } from "../core/logger.js";

/** Default per-attachment size cap (skip larger blobs to keep syncs bounded). */
export const DEFAULT_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export interface AttachmentPart {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

export interface SavedAttachment {
  /** Original filename as sent. */
  originalName: string;
  /** Stored raw filename (sanitized, message-prefixed) under attachments/. */
  storedName: string;
  /** Markdown filename under attachments/. */
  markdownName: string;
  /** Source ref used for LanceDB indexing. */
  ref: string;
  /** Number of indexed chunks produced from the Markdown. */
  chunks: number;
}

/**
 * Recursively collect downloadable attachment parts from a Gmail message
 * payload — any MIME part that carries both a filename and a body.attachmentId.
 * Inline parts without a filename (e.g. signature logos) are ignored.
 */
export function collectAttachmentParts(
  payload: gmail_v1.Schema$MessagePart | undefined
): AttachmentPart[] {
  const out: AttachmentPart[] = [];
  const walk = (part?: gmail_v1.Schema$MessagePart): void => {
    if (!part) return;
    const filename = part.filename ?? "";
    const attachmentId = part.body?.attachmentId ?? "";
    if (filename && attachmentId) {
      out.push({
        filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        attachmentId,
        size: part.body?.size ?? 0,
      });
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);
  return out;
}

/** Make a filename safe for use as a single path segment. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return (
    base
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || "attachment"
  );
}

/**
 * Download, convert and index every attachment of a single Gmail message.
 *
 * For each attachment: the raw bytes are saved under
 * `customers/<slug>/attachments/<messageId>__<name>`, converted to a sibling
 * `.md` file, and the Markdown is chunked and indexed into LanceDB so the
 * attachment's content is semantically searchable. Failures on a single
 * attachment are logged and skipped — they never abort the message sync.
 */
export async function processMessageAttachments(opts: {
  gmail: gmail_v1.Gmail;
  dataDir: string;
  slug: string;
  messageId: string;
  source: string;
  payload: gmail_v1.Schema$MessagePart | undefined;
  date: string;
  maxBytes?: number;
}): Promise<SavedAttachment[]> {
  const parts = collectAttachmentParts(opts.payload);
  if (parts.length === 0) return [];

  assertSafeSlug(opts.slug);
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES;
  const attachmentsDir = path.join(opts.dataDir, "customers", opts.slug, "attachments");
  fs.mkdirSync(attachmentsDir, { recursive: true });

  const { indexInLanceDB } = await import("../core/lancedb.js");
  const saved: SavedAttachment[] = [];

  for (const part of parts) {
    try {
      if (part.size > maxBytes) {
        logger.warn("gmail-sync", "skipping oversized attachment", {
          filename: part.filename,
          bytes: part.size,
        });
        continue;
      }

      const resp = await opts.gmail.users.messages.attachments.get({
        userId: "me",
        messageId: opts.messageId,
        id: part.attachmentId,
      });
      const data = resp.data.data;
      if (!data) continue;
      const buffer = Buffer.from(data, "base64url");

      const storedName = `${opts.messageId}__${sanitizeFilename(part.filename)}`;
      const markdownName = `${storedName}.md`;
      fs.writeFileSync(path.join(attachmentsDir, storedName), buffer);

      const { markdown } = await convertAttachment(buffer, part.filename, part.mimeType);
      const mdBody = `# ${part.filename}\n\n_Source: ${opts.source} · ${opts.date}_\n\n${markdown}\n`;
      fs.writeFileSync(path.join(attachmentsDir, markdownName), mdBody);

      const ref = `${opts.source}#att:${part.filename}`;
      const chunks = chunkText(markdown);
      for (let i = 0; i < chunks.length; i++) {
        await indexInLanceDB(opts.dataDir, opts.slug, chunks[i]!, `${ref}#${i}`, {
          date: opts.date,
          type: "attachment",
        }).catch((err: unknown) => {
          logger.error("gmail-sync", "attachment index failed", {
            error: (err as Error).message,
          });
        });
      }

      saved.push({
        originalName: part.filename,
        storedName,
        markdownName,
        ref,
        chunks: chunks.length,
      });
    } catch (err) {
      logger.warn("gmail-sync", "attachment failed", {
        filename: part.filename,
        error: (err as Error).message,
      });
    }
  }

  return saved;
}

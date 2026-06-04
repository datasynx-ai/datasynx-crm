// src/sync/email-body.ts
import type { gmail_v1 } from "@googleapis/gmail";
import { htmlToMarkdown } from "./converters/html.js";

export interface EmailBodyParts {
  plain?: string;
  html?: string;
}

/** Decode a Gmail part body (base64url) to a UTF-8 string. */
function decodeBody(data: string | null | undefined): string {
  if (!data) return "";
  return Buffer.from(data, "base64url").toString("utf-8");
}

/**
 * Recursively collect the text/plain and text/html bodies from a Gmail message
 * payload. Attachment parts (those with a filename) are ignored — only inline
 * body parts are considered. The first body of each type wins (the top-level
 * alternative), so signatures appended in nested forwards don't clobber it.
 */
export function collectBodyParts(
  payload: gmail_v1.Schema$MessagePart | undefined
): EmailBodyParts {
  const result: EmailBodyParts = {};
  const walk = (part?: gmail_v1.Schema$MessagePart): void => {
    if (!part) return;
    const mime = part.mimeType ?? "";
    const isAttachment = Boolean(part.filename) || Boolean(part.body?.attachmentId);
    if (!isAttachment && part.body?.data) {
      if (mime === "text/plain" && result.plain === undefined) {
        result.plain = decodeBody(part.body.data);
      } else if (mime === "text/html" && result.html === undefined) {
        result.html = decodeBody(part.body.data);
      }
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);
  return result;
}

/**
 * Extract the email body as Markdown: prefers the plain-text part verbatim,
 * otherwise converts the HTML part via Turndown. Returns an empty string when
 * the message carries no inline body (e.g. attachment-only messages).
 */
export async function extractEmailBodyMarkdown(
  payload: gmail_v1.Schema$MessagePart | undefined
): Promise<string> {
  const { plain, html } = collectBodyParts(payload);
  if (plain && plain.trim()) return plain.trim();
  if (html && html.trim()) return (await htmlToMarkdown(html)).trim();
  return "";
}

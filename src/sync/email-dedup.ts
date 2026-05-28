import crypto from "crypto";
import { normalizeEmail } from "../core/email-normalizer.js";

export interface EmailRef {
  messageId?: string;
  threadId?: string;
  subject?: string;
  from?: string;
  date?: string;
}

export function normalizeSubject(subject: string): string {
  let s = subject.toLowerCase().trim();
  // Strip Re:, Fwd:, Fw:, AW:, WG: prefixes repeatedly
  const prefixRe = /^(re:|fwd?:|aw:|wg:)\s*/i;
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(prefixRe, "").trim();
  }
  return s;
}

function normalizeFrom(from: string | undefined): string {
  if (!from) return "";
  const normalized = normalizeEmail(from);
  return normalized.includes("@") ? normalized : from.toLowerCase().trim();
}

export function deduplicateRefs(ref: EmailRef): string {
  if (ref.messageId) return `msgid://${ref.messageId}`;
  if (ref.threadId) return `thread://${ref.threadId}`;
  const key = `${normalizeSubject(ref.subject ?? "")}_${normalizeFrom(ref.from)}_${ref.date ?? ""}`;
  return `hash://${crypto.createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

export function isLikelySameThread(a: EmailRef, b: EmailRef): boolean {
  if (a.threadId && b.threadId) return a.threadId === b.threadId;
  if (a.messageId && b.messageId) return a.messageId === b.messageId;
  return (
    normalizeSubject(a.subject ?? "") === normalizeSubject(b.subject ?? "") &&
    normalizeFrom(a.from) === normalizeFrom(b.from)
  );
}

export function isAlreadySynced(existing: string, sourceRef: string): boolean {
  return existing.includes(sourceRef);
}

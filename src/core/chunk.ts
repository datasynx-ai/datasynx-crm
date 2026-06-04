// src/core/chunk.ts

export interface ChunkOptions {
  /** Target maximum characters per chunk. */
  maxChars?: number;
  /** Characters of overlap carried from the end of one chunk into the next. */
  overlap?: number;
}

/**
 * Split long text into overlapping chunks for embedding/indexing. Each chunk is
 * at most `maxChars`; chunks overlap by `overlap` characters so a query that
 * straddles a boundary still matches. Splits prefer the nearest whitespace
 * before the limit to avoid cutting words mid-token. Short text returns a single
 * trimmed chunk; empty/whitespace-only text returns no chunks.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? 1500;
  const overlap = Math.min(options.overlap ?? 150, Math.floor(maxChars / 2));
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    let end = Math.min(start + maxChars, trimmed.length);
    // Prefer breaking on whitespace, but only if it doesn't shrink the chunk too much.
    if (end < trimmed.length) {
      const lastSpace = trimmed.lastIndexOf(" ", end);
      if (lastSpace > start + maxChars / 2) end = lastSpace;
    }
    chunks.push(trimmed.slice(start, end).trim());
    if (end >= trimmed.length) break;
    start = end - overlap;
  }
  return chunks.filter((c) => c.length > 0);
}

import fs from "fs";
import path from "path";
import { writeFileAtomic } from "../fs/atomic-write.js";
import { assertSafeSlug } from "../fs/customer-dir.js";

/**
 * Interactions archiving (Step 4): move cold entries out of the hot
 * `interactions.md` into per-year archive files so the main file stays small
 * (faster appends and context builds). The LanceDB index is left untouched, so
 * archived content remains fully searchable via `search_customer_knowledge` —
 * archiving is purely a hot-file slimming operation, never data loss.
 */
export interface ArchiveOptions {
  /** Archive entries strictly older than this YYYY-MM-DD date. */
  before?: string;
  /** Protect the newest N entries from archiving. */
  keep?: number;
}

export interface ArchiveResult {
  archived: number;
  kept: number;
  /** Archive files written, relative to `dataDir`. */
  files: string[];
}

const ENTRY_HEAD = /^## \d{4}-\d{2}-\d{2}/m;
const ENTRY_SPLIT = /(?=^## \d{4}-\d{2}-\d{2})/m;
const DATE_RE = /^## (\d{4}-\d{2}-\d{2})/;

/** Default number of recent entries to keep when neither option is given. */
const DEFAULT_KEEP = 50;

function entryDate(entry: string): string | null {
  const m = DATE_RE.exec(entry);
  return m ? (m[1] ?? null) : null;
}

export async function archiveInteractions(
  dataDir: string,
  slug: string,
  options: ArchiveOptions = {}
): Promise<ArchiveResult> {
  assertSafeSlug(slug);
  const filePath = path.join(dataDir, "customers", slug, "interactions.md");
  if (!fs.existsSync(filePath)) return { archived: 0, kept: 0, files: [] };

  const content = fs.readFileSync(filePath, "utf-8") as string;
  const firstIdx = content.search(ENTRY_HEAD);
  if (firstIdx < 0) return { archived: 0, kept: 0, files: [] };

  const header = content.slice(0, firstIdx);
  const entries = content
    .slice(firstIdx)
    .split(ENTRY_SPLIT)
    .map((e) => e.trimEnd())
    .filter((e) => e.trim());

  // If neither bound is supplied, protect the newest DEFAULT_KEEP entries.
  const keep = options.keep ?? (options.before === undefined ? DEFAULT_KEEP : undefined);
  const before = options.before;

  const keptEntries: string[] = [];
  const archivedByYear = new Map<string, string[]>();

  entries.forEach((entry, index) => {
    const date = entryDate(entry);
    const recentProtected = keep !== undefined && index < keep;
    const oldEnough = before === undefined || (date !== null && date < before);
    if (!recentProtected && oldEnough && date !== null) {
      const year = date.slice(0, 4);
      const list = archivedByYear.get(year) ?? [];
      list.push(entry);
      archivedByYear.set(year, list);
    } else {
      keptEntries.push(entry);
    }
  });

  const archived = [...archivedByYear.values()].reduce((n, l) => n + l.length, 0);
  if (archived === 0) {
    return { archived: 0, kept: keptEntries.length, files: [] };
  }

  // Rewrite the hot file with header + kept entries.
  const keptText = keptEntries.join("\n\n");
  writeFileAtomic(filePath, `${(header + keptText).trimEnd()}\n`);

  // Append archived entries to per-year archive files (created if absent).
  const files: string[] = [];
  for (const [year, list] of archivedByYear) {
    const rel = path.join("customers", slug, "interactions-archive", `${year}.md`);
    const archivePath = path.join(dataDir, rel);
    const prefix = fs.existsSync(archivePath)
      ? `${(fs.readFileSync(archivePath, "utf-8") as string).trimEnd()}\n\n`
      : `# Interactions Archive ${year}\n\n`;
    writeFileAtomic(archivePath, `${prefix}${list.join("\n\n").trimEnd()}\n`);
    files.push(rel);
  }

  return { archived, kept: keptEntries.length, files };
}

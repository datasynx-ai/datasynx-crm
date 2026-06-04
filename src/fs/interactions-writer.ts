import fs from "fs";
import path from "path";
import type { InteractionEntry } from "../schemas/interaction.js";
import { withFileQueue } from "./write-queue.js";
import { writeFileAtomic } from "./atomic-write.js";
import { assertSafeSlug } from "./customer-dir.js";

const INTERACTION_SEPARATOR = "---";

export function formatInteractionEntry(entry: InteractionEntry): string {
  const header = `## ${entry.date} · ${entry.type}${entry.direction ? ` · ${entry.direction}` : ""}`;
  const withLabel = entry.type === "Email" ? "Subject" : "With";
  const nextStepsBlock =
    entry.nextSteps.length > 0 ? entry.nextSteps.map((s) => `- [ ] ${s}`).join("\n") : "- [ ] —";

  return `${header}
**${withLabel}:** ${entry.with}
**Summary:** ${entry.summary}
**Next Steps:**
${nextStepsBlock}
**Source:** ${entry.sourceRef}
**Synced:** ${entry.synced}
${INTERACTION_SEPARATOR}
`;
}

export async function readInteractions(dataDir: string, slug: string): Promise<string> {
  const filePath = path.join(dataDir, "customers", slug, "interactions.md");
  if (!fs.existsSync(filePath)) {
    return "";
  }
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Per-run source-ref deduplication index for bulk imports. Loads each slug's
 * interactions file once (not once per row) and tracks freshly-appended refs
 * in memory, so a 5k-row import stays linear instead of re-reading a growing
 * file on every row (the previous O(rows²) behavior).
 */
export class InteractionDedup {
  private readonly cache = new Map<string, string>();
  constructor(private readonly dataDir: string) {}

  /** True if `sourceRef` already exists for `slug` (on disk or appended this run). */
  async seen(slug: string, sourceRef: string): Promise<boolean> {
    let content = this.cache.get(slug);
    if (content === undefined) {
      content = await readInteractions(this.dataDir, slug).catch(() => "");
      this.cache.set(slug, content);
    }
    return content.includes(sourceRef);
  }

  /** Record that `sourceRef` was just appended, so later rows dedupe against it. */
  markAppended(slug: string, sourceRef: string): void {
    this.cache.set(slug, (this.cache.get(slug) ?? "") + sourceRef);
  }
}

export async function appendInteraction(
  dataDir: string,
  slug: string,
  entry: InteractionEntry
): Promise<void> {
  assertSafeSlug(slug);
  const filePath = path.join(dataDir, "customers", slug, "interactions.md");
  return withFileQueue(filePath, async () => {
    const existing = fs.existsSync(filePath) ? (fs.readFileSync(filePath, "utf-8") as string) : "";

    const formatted = formatInteractionEntry(entry);

    let newContent: string;
    if (existing === "") {
      newContent = formatted;
    } else {
      const headerEnd = existing.indexOf("\n\n");
      if (headerEnd > -1) {
        const header = existing.slice(0, headerEnd + 2);
        const body = existing.slice(headerEnd + 2);
        newContent = header + formatted + "\n" + body;
      } else {
        newContent = existing + "\n" + formatted;
      }
    }

    writeFileAtomic(filePath, newContent);
  });
}

// src/sync/transcript-watcher.ts
// chokidar v4 — NO glob support in watch(), use ignored as a function
import chokidar, { type FSWatcher } from "chokidar";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { escapeRegExp } from "../core/regex.js";
import { logger } from "../core/logger.js";

interface WatchOptions {
  paths: string[];
  extensions: string[];
  dataDir: string;
  onFile: (filePath: string) => Promise<void>;
}

export function watchTranscripts(opts: WatchOptions): FSWatcher {
  const { paths, extensions, onFile } = opts;

  const watcher = chokidar.watch(paths, {
    // v4: ignored is a function (no glob strings)
    ignored: (p: string, stats?: fs.Stats) => {
      if (stats?.isDirectory()) return false;
      return !extensions.some((ext) => p.endsWith(ext));
    },
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
    ignoreInitial: false,
    persistent: true,
  });

  watcher.on("add", (filePath) => {
    onFile(filePath).catch((err: unknown) => {
      logger.error("transcript-watcher", "error processing file", {
        filePath,
        error: (err as Error).message,
      });
    });
  });

  return watcher;
}

export async function processTranscriptFile(
  filePath: string,
  slug: string,
  dataDir: string
): Promise<void> {
  const source = `file://${filePath}`;

  const { readInteractions, appendInteraction } = await import("../fs/interactions-writer.js");
  const existing = await readInteractions(dataDir, slug);
  if (existing.includes(source)) return;

  const content = fs.readFileSync(filePath, "utf-8");
  const date = new Date().toISOString().slice(0, 10);
  const filename = filePath.split("/").pop() ?? filePath;

  await appendInteraction(dataDir, slug, {
    date,
    type: "Meeting",
    with: filename,
    subject: filename,
    summary: content.slice(0, 500) + (content.length > 500 ? "..." : ""),
    nextSteps: [],
    sourceRef: source,
    synced: new Date().toISOString(),
  });

  const { indexInLanceDB } = await import("../core/lancedb.js");
  await indexInLanceDB(dataDir, slug, content.slice(0, 2000), source, {
    date,
    type: "Meeting",
  }).catch((err: unknown) => {
    logger.error("transcript-watcher", "LanceDB index failed", { error: (err as Error).message });
  });
}

function readCustomerName(customersDir: string, slug: string): string {
  const mainFactsPath = path.join(customersDir, slug, "main_facts.md");
  if (!fs.existsSync(mainFactsPath)) return slug;
  try {
    const raw = matter(fs.readFileSync(mainFactsPath, "utf-8"));
    return typeof raw.data["name"] === "string" ? raw.data["name"] : slug;
  } catch {
    return slug;
  }
}

function fuzzyMatchCustomer(
  filePath: string,
  content: string,
  candidates: Array<{ slug: string; name: string }>
): { slug: string } | null {
  const filename = path.basename(filePath).toLowerCase();
  const contentPreview = content.toLowerCase().slice(0, 5_000);

  let best: { slug: string; score: number } | null = null;

  for (const { slug, name } of candidates) {
    let score = 0;
    const nameLower = name.toLowerCase();
    const slugLower = slug.toLowerCase();

    // Filename match is the strongest signal
    if (filename.includes(slugLower) || filename.includes(nameLower.replace(/\s+/g, "-"))) {
      score += 10;
    }

    // Count name occurrences in content
    score += contentPreview.match(new RegExp(escapeRegExp(nameLower), "g"))?.length ?? 0;

    if (score > 0 && (!best || score > best.score)) {
      best = { slug, score };
    }
  }

  return best ? { slug: best.slug } : null;
}

export async function processTranscriptFileAutoMatch(
  filePath: string,
  dataDir: string
): Promise<void> {
  const customersDir = path.join(dataDir, "customers");
  if (!fs.existsSync(customersDir)) {
    await recordUnmatched(dataDir, filePath, "no_customers_defined");
    return;
  }

  const slugs = fs.readdirSync(customersDir).filter((s) => {
    try {
      return fs.statSync(path.join(customersDir, s)).isDirectory();
    } catch {
      return false;
    }
  });

  if (slugs.length === 0) {
    await recordUnmatched(dataDir, filePath, "no_customers_defined");
    return;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const candidates = slugs.map((slug) => ({
    slug,
    name: readCustomerName(customersDir, slug),
  }));

  const matchedSlug = await matchCustomer(filePath, content, candidates);

  if (matchedSlug) {
    await processTranscriptFile(filePath, matchedSlug, dataDir);
  } else {
    await recordUnmatched(dataDir, filePath, "no_customer_match");
  }
}

/**
 * Resolve a transcript to a customer slug. Prefers LLM recognition (when an
 * ANTHROPIC_API_KEY is configured) and falls back to the filename/content
 * heuristic. The LLM result is only trusted when it names a known candidate
 * with at least medium confidence — guarding against hallucinated slugs.
 */
async function matchCustomer(
  filePath: string,
  content: string,
  candidates: Array<{ slug: string; name: string }>
): Promise<string | null> {
  try {
    const { recognizeCustomer } = await import("../core/llm.js");
    const llm = await recognizeCustomer(content, candidates);
    if (llm.slug && llm.confidence !== "low" && candidates.some((c) => c.slug === llm.slug)) {
      return llm.slug;
    }
  } catch (err: unknown) {
    logger.warn("transcript-watcher", "LLM recognition failed, using heuristic", {
      error: (err as Error).message,
    });
  }

  return fuzzyMatchCustomer(filePath, content, candidates)?.slug ?? null;
}

async function recordUnmatched(
  dataDir: string,
  filePath: string,
  reason: "no_customer_match" | "no_customers_defined"
): Promise<void> {
  const { appendUnmatched } = await import("../fs/unmatched-transcripts.js");
  appendUnmatched(dataDir, { filePath, addedAt: new Date().toISOString(), reason });
  logger.info("transcript-watcher", "unmatched transcript", { filePath, reason });
}

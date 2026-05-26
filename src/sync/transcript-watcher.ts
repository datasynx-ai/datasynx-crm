// src/sync/transcript-watcher.ts
// chokidar v4 — NO glob support in watch(), use ignored as a function
import chokidar, { type FSWatcher } from "chokidar";
import fs from "fs";

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
      console.error(`[transcript-watcher] Error processing ${filePath}:`, (err as Error).message);
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

  // Check idempotency before reading file
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
    process.stderr.write(`[transcript-watcher] LanceDB index failed: ${(err as Error).message}\n`);
  });
}

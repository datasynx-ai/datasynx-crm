import fs from "fs";
import path from "path";
import { listCustomerSlugs } from "../fs/customer-dir.js";
import { readPipelineSync } from "../fs/pipeline-writer.js";
import { readJsonFile, writeJsonFile } from "../fs/json-store.js";
import type { PipelineDeal } from "../schemas/pipeline.js";

/**
 * Pipeline time-travel (snapshots + diff). A daily snapshot captures every deal
 * across all customers so we can answer "what changed in my pipeline since X?".
 * Snapshots live in `.agentic/snapshots/<YYYY-MM-DD>.json` (atomic, one per day);
 * old ones are pruned to a retention limit. The headline use case — a weekly
 * "what moved?" digest — is served by diffAgainstNow / get_pipeline_changes.
 */
export interface SnapshotDeal {
  slug: string;
  name: string;
  stage: PipelineDeal["stage"];
  value: number;
  probability: number;
  /** Pipeline id (#47); missing in old snapshots = the default pipeline. */
  pipeline?: string;
}

export interface PipelineSnapshot {
  id: string; // YYYY-MM-DD
  takenAt: string; // full ISO timestamp
  deals: SnapshotDeal[];
}

export interface SnapshotMeta {
  id: string;
  takenAt: string;
  dealCount: number;
  openValue: number;
}

export interface DealRef {
  slug: string;
  name: string;
}
export interface StageMove extends DealRef {
  from: PipelineDeal["stage"];
  to: PipelineDeal["stage"];
}
export interface ValueMove extends DealRef {
  from: number;
  to: number;
}

export interface PipelineDiff {
  fromId: string;
  toId: string;
  added: DealRef[];
  removed: DealRef[];
  advanced: StageMove[]; // any stage change (incl. won/lost)
  won: DealRef[];
  lost: DealRef[];
  valueChanged: ValueMove[];
  openValueBefore: number;
  openValueAfter: number;
  openValueDelta: number;
}

const DEFAULT_KEEP = 90;

function snapshotsDir(dataDir: string): string {
  return path.join(dataDir, ".agentic", "snapshots");
}
function snapshotPath(dataDir: string, id: string): string {
  return path.join(snapshotsDir(dataDir), `${id}.json`);
}
function dealKey(d: DealRef): string {
  return `${d.slug}::${d.name}`;
}
function isOpen(stage: PipelineDeal["stage"]): boolean {
  return stage !== "won" && stage !== "lost";
}
function openValue(deals: SnapshotDeal[]): number {
  return deals.filter((d) => isOpen(d.stage)).reduce((sum, d) => sum + d.value, 0);
}

/** Build a live snapshot of the current pipeline across all customers. */
export function collectDeals(dataDir: string): SnapshotDeal[] {
  const deals: SnapshotDeal[] = [];
  for (const slug of listCustomerSlugs(dataDir)) {
    for (const d of readPipelineSync(dataDir, slug)) {
      deals.push({
        slug,
        name: d.name,
        stage: d.stage,
        value: d.value ?? 0,
        probability: d.probability ?? 0,
        ...(d.pipeline ? { pipeline: d.pipeline } : {}),
      });
    }
  }
  return deals;
}

function retentionKeep(opts?: { keep?: number }): number {
  if (opts?.keep !== undefined) return opts.keep;
  const n = parseInt(process.env["DXCRM_SNAPSHOT_KEEP"] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_KEEP;
}

/** Take (or overwrite) today's snapshot and prune beyond the retention limit. */
export function takeSnapshot(
  dataDir: string,
  id: string = new Date().toISOString().slice(0, 10),
  opts?: { keep?: number }
): PipelineSnapshot {
  const snapshot: PipelineSnapshot = {
    id,
    takenAt: new Date().toISOString(),
    deals: collectDeals(dataDir),
  };
  writeJsonFile(snapshotPath(dataDir, id), snapshot);
  pruneSnapshots(dataDir, retentionKeep(opts));
  return snapshot;
}

function snapshotIds(dataDir: string): string[] {
  const dir = snapshotsDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function pruneSnapshots(dataDir: string, keep: number): void {
  const ids = snapshotIds(dataDir);
  if (ids.length <= keep) return;
  for (const id of ids.slice(0, ids.length - keep)) {
    try {
      fs.rmSync(snapshotPath(dataDir, id), { force: true });
    } catch {
      /* best-effort */
    }
  }
}

export function loadSnapshot(dataDir: string, id: string): PipelineSnapshot | null {
  return readJsonFile<PipelineSnapshot | null>(snapshotPath(dataDir, id), null);
}

export function listSnapshots(dataDir: string): SnapshotMeta[] {
  return snapshotIds(dataDir).flatMap((id) => {
    const snap = loadSnapshot(dataDir, id);
    if (!snap) return [];
    return [
      { id, takenAt: snap.takenAt, dealCount: snap.deals.length, openValue: openValue(snap.deals) },
    ];
  });
}

/** The most recent snapshot whose id is at or before `iso` (YYYY-MM-DD). */
export function latestSnapshotAtOrBefore(dataDir: string, iso: string): PipelineSnapshot | null {
  const id = snapshotIds(dataDir)
    .filter((s) => s <= iso)
    .pop();
  return id ? loadSnapshot(dataDir, id) : null;
}

/** Compute what changed between two snapshots (before → after). */
export function diffSnapshots(before: PipelineSnapshot, after: PipelineSnapshot): PipelineDiff {
  const beforeByKey = new Map(before.deals.map((d) => [dealKey(d), d]));
  const afterByKey = new Map(after.deals.map((d) => [dealKey(d), d]));

  const added: DealRef[] = [];
  const removed: DealRef[] = [];
  const advanced: StageMove[] = [];
  const won: DealRef[] = [];
  const lost: DealRef[] = [];
  const valueChanged: ValueMove[] = [];

  for (const [key, a] of afterByKey) {
    const b = beforeByKey.get(key);
    if (!b) {
      added.push({ slug: a.slug, name: a.name });
      continue;
    }
    if (b.stage !== a.stage) {
      advanced.push({ slug: a.slug, name: a.name, from: b.stage, to: a.stage });
      if (a.stage === "won") won.push({ slug: a.slug, name: a.name });
      if (a.stage === "lost") lost.push({ slug: a.slug, name: a.name });
    }
    if (b.value !== a.value) {
      valueChanged.push({ slug: a.slug, name: a.name, from: b.value, to: a.value });
    }
  }
  for (const [key, b] of beforeByKey) {
    if (!afterByKey.has(key)) removed.push({ slug: b.slug, name: b.name });
  }

  const openValueBefore = openValue(before.deals);
  const openValueAfter = openValue(after.deals);
  return {
    fromId: before.id,
    toId: after.id,
    added,
    removed,
    advanced,
    won,
    lost,
    valueChanged,
    openValueBefore,
    openValueAfter,
    openValueDelta: openValueAfter - openValueBefore,
  };
}

/**
 * Diff the live pipeline against the latest snapshot at/before `since`.
 * Returns null when no baseline snapshot exists yet.
 */
export function diffAgainstNow(
  dataDir: string,
  since: string,
  today: string = new Date().toISOString().slice(0, 10)
): PipelineDiff | null {
  const baseline = latestSnapshotAtOrBefore(dataDir, since);
  if (!baseline) return null;
  const now: PipelineSnapshot = {
    id: today,
    takenAt: new Date().toISOString(),
    deals: collectDeals(dataDir),
  };
  return diffSnapshots(baseline, now);
}

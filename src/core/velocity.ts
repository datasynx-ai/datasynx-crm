import { listSnapshots, loadSnapshot } from "./snapshots.js";
import type { PipelineSnapshot, SnapshotDeal } from "./snapshots.js";
import type { PipelineDeal } from "../schemas/pipeline.js";

/**
 * Pipeline velocity analytics, reconstructed from the daily snapshot history
 * (see snapshots.ts). By walking each deal's stage over consecutive snapshots
 * we recover: how long deals dwell in each stage, the average sales cycle
 * (first-seen → won), and which open deals have stalled (no stage change for
 * longer than a threshold). This answers "where do deals get stuck?" and
 * "which deals are rotting?" — without any extra bookkeeping at write time.
 */
export type Stage = PipelineDeal["stage"];

export interface StageDuration {
  stage: Stage;
  avgDays: number;
  /** Number of completed dwells observed (a deal left this stage). */
  samples: number;
}

export interface StalledDeal {
  slug: string;
  name: string;
  stage: Stage;
  daysInStage: number;
  value: number;
}

export interface VelocityReport {
  fromId: string | null;
  toId: string | null;
  snapshotCount: number;
  stageDurations: StageDuration[];
  avgSalesCycleDays: number | null;
  wonCount: number;
  stalledDeals: StalledDeal[];
  stalledThresholdDays: number;
}

const DEFAULT_STALLED_DAYS = 14;
const OPEN_STAGES: Stage[] = ["lead", "qualified", "proposal", "negotiation"];

function dealKey(d: { slug: string; name: string }): string {
  return `${d.slug}::${d.name}`;
}

function isOpen(stage: Stage): boolean {
  return stage !== "won" && stage !== "lost";
}

/** Whole days between two YYYY-MM-DD ids (b - a). */
function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function stalledThreshold(opts?: { stalledDays?: number }): number {
  if (opts?.stalledDays !== undefined) return opts.stalledDays;
  const n = parseInt(process.env["DXCRM_STALLED_DAYS"] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STALLED_DAYS;
}

interface TimelinePoint {
  date: string;
  stage: Stage;
  deal: SnapshotDeal;
}

/** Per-deal chronological list of (date, stage) observations. */
function buildTimelines(
  snaps: PipelineSnapshot[],
  pipelineId?: string
): Map<string, TimelinePoint[]> {
  const timelines = new Map<string, TimelinePoint[]>();
  for (const snap of snaps) {
    for (const deal of snap.deals) {
      // Pipeline scoping (#47): old snapshots without the field = default.
      if (pipelineId && (deal.pipeline ?? "default") !== pipelineId) continue;
      const key = dealKey(deal);
      const points = timelines.get(key) ?? [];
      points.push({ date: snap.id, stage: deal.stage, deal });
      timelines.set(key, points);
    }
  }
  return timelines;
}

export function analyzeVelocity(
  dataDir: string,
  opts?: { stalledDays?: number; pipelineId?: string }
): VelocityReport {
  const threshold = stalledThreshold(opts);
  const metas = listSnapshots(dataDir);
  if (metas.length === 0) {
    return {
      fromId: null,
      toId: null,
      snapshotCount: 0,
      stageDurations: [],
      avgSalesCycleDays: null,
      wonCount: 0,
      stalledDeals: [],
      stalledThresholdDays: threshold,
    };
  }

  const snaps: PipelineSnapshot[] = metas.flatMap((m) => {
    const s = loadSnapshot(dataDir, m.id);
    return s ? [s] : [];
  });
  const latestId = snaps[snaps.length - 1]!.id;

  const timelines = buildTimelines(snaps, opts?.pipelineId);

  // Accumulate completed stage dwells and sales-cycle durations.
  const dwellTotals = new Map<Stage, { total: number; samples: number }>();
  const cycleDurations: number[] = [];
  let wonCount = 0;
  const stalledDeals: StalledDeal[] = [];

  for (const points of timelines.values()) {
    const firstSeen = points[0]!.date;
    let stageEnteredAt = points[0]!.date;
    let currentStage = points[0]!.stage;

    for (let i = 1; i < points.length; i++) {
      const p = points[i]!;
      if (p.stage !== currentStage) {
        // currentStage dwell completed at p.date.
        const acc = dwellTotals.get(currentStage) ?? { total: 0, samples: 0 };
        acc.total += daysBetween(stageEnteredAt, p.date);
        acc.samples += 1;
        dwellTotals.set(currentStage, acc);

        if (p.stage === "won") {
          wonCount += 1;
          cycleDurations.push(daysBetween(firstSeen, p.date));
        }
        currentStage = p.stage;
        stageEnteredAt = p.date;
      }
    }

    // Stalled check: open deal still present in the latest snapshot.
    const last = points[points.length - 1]!;
    if (last.date === latestId && isOpen(last.stage)) {
      const daysInStage = daysBetween(stageEnteredAt, latestId);
      if (daysInStage > threshold) {
        stalledDeals.push({
          slug: last.deal.slug,
          name: last.deal.name,
          stage: last.stage,
          daysInStage,
          value: last.deal.value,
        });
      }
    }
  }

  const stageDurations: StageDuration[] = OPEN_STAGES.flatMap((stage) => {
    const acc = dwellTotals.get(stage);
    if (!acc || acc.samples === 0) return [];
    return [{ stage, avgDays: Math.round(acc.total / acc.samples), samples: acc.samples }];
  });

  const avgSalesCycleDays =
    cycleDurations.length > 0
      ? Math.round(cycleDurations.reduce((a, b) => a + b, 0) / cycleDurations.length)
      : null;

  stalledDeals.sort((a, b) => b.daysInStage - a.daysInStage);

  return {
    fromId: snaps[0]!.id,
    toId: latestId,
    snapshotCount: snaps.length,
    stageDurations,
    avgSalesCycleDays,
    wonCount,
    stalledDeals,
    stalledThresholdDays: threshold,
  };
}

import { listSnapshots, loadSnapshot } from "./snapshots.js";
import type { Stage } from "./velocity.js";

/**
 * Pipeline conversion funnel & win-rate, reconstructed from the daily snapshot
 * history (see snapshots.ts). For each deal we track the furthest stage it ever
 * reached and whether it was ultimately won or lost, then build a cumulative
 * funnel: how many deals reached each stage, the stage-to-stage conversion, the
 * overall win rate, and the biggest leak (lowest-converting transition).
 * Answers "where do deals leak out of my pipeline?" and "what's my win rate?".
 */
export interface FunnelStage {
  stage: Stage;
  /** Deals that ever reached this stage or further (cumulative). */
  reached: number;
  /** Conversion to the next stage as a rounded percentage, or null if terminal. */
  conversionPctToNext: number | null;
}

export interface FunnelLeak {
  from: Stage;
  to: Stage;
  conversionPct: number;
}

export interface FunnelReport {
  fromId: string | null;
  toId: string | null;
  snapshotCount: number;
  stages: FunnelStage[];
  wonCount: number;
  lostCount: number;
  /** won / (won + lost) as a rounded percentage, or null when nothing closed. */
  winRatePct: number | null;
  biggestLeak: FunnelLeak | null;
}

// Ordered funnel stages. `won` is the terminal success stage; `lost` is a
// terminal failure that does not occupy a funnel slot.
const FUNNEL_STAGES: Stage[] = ["lead", "qualified", "proposal", "negotiation", "won"];
const STAGE_INDEX: Record<string, number> = Object.fromEntries(FUNNEL_STAGES.map((s, i) => [s, i]));

interface DealProgress {
  maxIndex: number; // furthest funnel index reached (-1 if only ever lost)
  won: boolean;
  lost: boolean;
}

function emptyReport(snapshotCount: number): FunnelReport {
  return {
    fromId: null,
    toId: null,
    snapshotCount,
    stages: [],
    wonCount: 0,
    lostCount: 0,
    winRatePct: null,
    biggestLeak: null,
  };
}

export function analyzeFunnel(dataDir: string, opts?: { pipelineId?: string }): FunnelReport {
  const metas = listSnapshots(dataDir);
  if (metas.length === 0) return emptyReport(0);

  const snaps = metas.flatMap((m) => {
    const s = loadSnapshot(dataDir, m.id);
    return s ? [s] : [];
  });

  // Aggregate each deal's furthest stage + terminal outcome in a single pass.
  const progress = new Map<string, DealProgress>();
  for (const snap of snaps) {
    for (const deal of snap.deals) {
      // Pipeline scoping (#47): old snapshots without the field = default.
      if (opts?.pipelineId && (deal.pipeline ?? "default") !== opts.pipelineId) continue;
      const key = `${deal.slug}::${deal.name}`;
      const p = progress.get(key) ?? { maxIndex: -1, won: false, lost: false };
      if (deal.stage === "lost") {
        p.lost = true;
      } else {
        const idx = STAGE_INDEX[deal.stage];
        if (idx !== undefined && idx > p.maxIndex) p.maxIndex = idx;
        if (deal.stage === "won") p.won = true;
      }
      progress.set(key, p);
    }
  }

  // Cumulative reach: a deal at maxIndex i counts toward stages 0..i.
  const reached = new Array<number>(FUNNEL_STAGES.length).fill(0);
  let wonCount = 0;
  let lostCount = 0;
  for (const p of progress.values()) {
    for (let i = 0; i <= p.maxIndex; i++) reached[i] = (reached[i] ?? 0) + 1;
    if (p.won) wonCount += 1;
    else if (p.lost) lostCount += 1;
  }

  const stages: FunnelStage[] = FUNNEL_STAGES.map((stage, i) => {
    const here = reached[i] ?? 0;
    const next = reached[i + 1];
    const conversionPctToNext =
      next === undefined || here === 0 ? null : Math.round((next / here) * 100);
    return { stage, reached: here, conversionPctToNext };
  });

  let biggestLeak: FunnelLeak | null = null;
  for (let i = 0; i < FUNNEL_STAGES.length - 1; i++) {
    const conv = stages[i]!.conversionPctToNext;
    if (conv === null) continue;
    if (biggestLeak === null || conv < biggestLeak.conversionPct) {
      biggestLeak = { from: FUNNEL_STAGES[i]!, to: FUNNEL_STAGES[i + 1]!, conversionPct: conv };
    }
  }

  const closed = wonCount + lostCount;
  const winRatePct = closed > 0 ? Math.round((wonCount / closed) * 100) : null;

  return {
    fromId: snaps[0]!.id,
    toId: snaps[snaps.length - 1]!.id,
    snapshotCount: snaps.length,
    stages,
    wonCount,
    lostCount,
    winRatePct,
    biggestLeak,
  };
}

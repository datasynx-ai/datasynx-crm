import type { PipelineDeal } from "../schemas/pipeline.js";

export type TouchSentiment = "positive" | "neutral" | "negative";

export interface DealHealthSignals {
  daysSinceLastActivity: number;
  daysInCurrentStage: number;
  daysToClose?: number | undefined;
  probability?: number | undefined;
  /** Structural: an economic buyer is identified in the relationship graph. */
  hasEconomicBuyer?: boolean | undefined;
  /** Structural: a champion is identified in the relationship graph. */
  hasChampion?: boolean | undefined;
  /** Sentiment of the most recent touchpoint summary. */
  lastTouchSentiment?: TouchSentiment | undefined;
}

export interface DealHealthScore {
  score: number; // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  signals: DealHealthSignals;
  warnings: string[];
}

/**
 * Deal-Health v2 — a *weighted blend* of structural and timing signals, so the
 * score is honest rather than recency-dominated (issue #54). A freshly-touched
 * deal that lacks an economic buyer no longer scores an A. Weights are public
 * and sum to 1.0; each component is a 0–100 sub-score.
 */
export const DEAL_HEALTH_WEIGHTS = {
  /** Stakeholder coverage (economic buyer / champion) — the structural core. */
  stakeholder: 0.3,
  /** Activity recency. */
  recency: 0.2,
  /** Time stuck in the current stage. */
  stageDwell: 0.15,
  /** Sentiment of the last touchpoint. */
  sentiment: 0.15,
  /** Probability plausibility vs. the stage expectation. */
  probability: 0.1,
  /** Close-date proximity / overdue. */
  closeDate: 0.1,
} as const;

/** Default stage → expected win probability (mirrors DEFAULT_STAGES). */
const EXPECTED_STAGE_PROBABILITY: Record<string, number> = {
  lead: 10,
  qualified: 30,
  proposal: 50,
  negotiation: 75,
  won: 100,
  lost: 0,
};

/** An economic buyer is expected once a deal reaches proposal/negotiation. */
function economicBuyerExpected(stage: string): boolean {
  return stage === "proposal" || stage === "negotiation";
}

/** A champion is expected from qualified onwards. */
function championExpected(stage: string): boolean {
  return stage === "qualified" || stage === "proposal" || stage === "negotiation";
}

const NEGATIVE_MARKERS = [
  // English
  "too expensive",
  "too pricey",
  "concern",
  "concerns",
  "competitor",
  "competition",
  "on hold",
  "pushback",
  "objection",
  "no budget",
  "not interested",
  "delay",
  "postpone",
  "blocker",
  "churn",
  "cancel",
  // German
  "bedenken",
  "zu teuer",
  "wettbewerb",
  "konkurrenz",
  "auf eis",
  "verschieb",
  "kein budget",
  "kein interesse",
  "einwand",
  "storno",
];

const POSITIVE_MARKERS = [
  "confirmed",
  "signed",
  "agreed",
  "approved",
  "excited",
  "go-ahead",
  "greenlight",
  "zugesagt",
  "unterschrieben",
  "genehmigt",
  "begeistert",
];

/**
 * Lightweight, local-first sentiment of a touchpoint summary. Not ML — a
 * keyword heuristic tuned for sales risk signals (budget/competition/stall).
 * Negative markers win over positive ("budget" alone is NOT a marker, so
 * "budget confirmed" stays positive). Full ML sentiment is tracked separately
 * (see #42/#45).
 */
export function detectTouchSentiment(text: string): TouchSentiment {
  const t = text.toLowerCase();
  if (NEGATIVE_MARKERS.some((m) => t.includes(m))) return "negative";
  if (POSITIVE_MARKERS.some((m) => t.includes(m))) return "positive";
  return "neutral";
}

function gradeFromScore(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

interface Component {
  score: number;
  warnings: string[];
}

function scoreRecency(days: number): Component {
  if (days > 60) return { score: 0, warnings: [`No activity in ${days} days`] };
  if (days > 30) return { score: 40, warnings: [`Low activity — last touch ${days} days ago`] };
  if (days > 14) return { score: 75, warnings: [] };
  return { score: 100, warnings: [] };
}

function scoreStageDwell(days: number, stage: string): Component {
  if (days > 90) return { score: 30, warnings: [`Stuck in "${stage}" for ${days} days`] };
  if (days > 45) return { score: 70, warnings: [`Slow progress in "${stage}"`] };
  return { score: 100, warnings: [] };
}

function scoreCloseDate(daysToClose: number | undefined): Component {
  if (daysToClose === undefined) return { score: 100, warnings: [] };
  if (daysToClose < 0) return { score: 40, warnings: ["Close date passed"] };
  if (daysToClose < 7) return { score: 70, warnings: ["Close date in less than 7 days"] };
  return { score: 100, warnings: [] };
}

function scoreProbability(probability: number | undefined, stage: string): Component {
  if (probability === undefined) return { score: 100, warnings: [] };
  if (stage === "lead" || stage === "won" || stage === "lost") return { score: 100, warnings: [] };
  const expected = EXPECTED_STAGE_PROBABILITY[stage] ?? 50;
  if (probability < expected - 30) {
    return {
      score: 50,
      warnings: [`Low probability (${probability}%) for stage "${stage}" (expected ~${expected}%)`],
    };
  }
  return { score: 100, warnings: [] };
}

function scoreStakeholders(
  stage: string,
  hasEconomicBuyer: boolean | undefined,
  hasChampion: boolean | undefined
): Component {
  let score = 100;
  const warnings: string[] = [];
  if (economicBuyerExpected(stage) && hasEconomicBuyer === false) {
    score -= 50;
    warnings.push(
      `No economic buyer identified for a "${stage}" deal — decision authority unconfirmed`
    );
  }
  if (championExpected(stage) && hasChampion === false) {
    score -= 25;
    warnings.push(`No champion identified for a "${stage}" deal — no internal advocate`);
  }
  return { score: Math.max(0, score), warnings };
}

function scoreSentiment(sentiment: TouchSentiment | undefined): Component {
  if (sentiment === "negative") {
    return {
      score: 40,
      warnings: ["Last touchpoint shows risk signals (e.g. budget/competition/objection)"],
    };
  }
  return { score: 100, warnings: [] };
}

export function scoreDeal(deal: PipelineDeal, signals: DealHealthSignals): DealHealthScore {
  const stakeholder = scoreStakeholders(deal.stage, signals.hasEconomicBuyer, signals.hasChampion);
  const sentiment = scoreSentiment(signals.lastTouchSentiment);
  const recency = scoreRecency(signals.daysSinceLastActivity);
  const dwell = scoreStageDwell(signals.daysInCurrentStage, deal.stage);
  const closeDate = scoreCloseDate(signals.daysToClose);
  const probability = scoreProbability(signals.probability, deal.stage);

  const weighted =
    DEAL_HEALTH_WEIGHTS.stakeholder * stakeholder.score +
    DEAL_HEALTH_WEIGHTS.recency * recency.score +
    DEAL_HEALTH_WEIGHTS.stageDwell * dwell.score +
    DEAL_HEALTH_WEIGHTS.sentiment * sentiment.score +
    DEAL_HEALTH_WEIGHTS.probability * probability.score +
    DEAL_HEALTH_WEIGHTS.closeDate * closeDate.score;

  const score = Math.max(0, Math.min(100, Math.round(weighted)));

  // Order warnings by importance: structural → sentiment → timing.
  const warnings = [
    ...stakeholder.warnings,
    ...sentiment.warnings,
    ...recency.warnings,
    ...dwell.warnings,
    ...closeDate.warnings,
    ...probability.warnings,
  ];

  let grade = gradeFromScore(score);
  // Hard rule: no A in negotiation without an identified economic buyer —
  // keeps get_deal_health consistent with open_deal_room's critical gap.
  if (deal.stage === "negotiation" && signals.hasEconomicBuyer === false && grade === "A") {
    grade = "B";
  }

  return { score, grade, signals, warnings };
}

export interface DealTiming {
  daysSinceLastActivity: number;
  daysInCurrentStage: number;
  daysToClose?: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Derive activity/close timing for a deal relative to `todayDate`. Centralizes
 * the day-diff math that deal-room and deal-agent each computed identically.
 * A blank/whitespace close_date yields `undefined` (not a NaN day count).
 */
export function deriveDealTiming(deal: PipelineDeal, todayDate: Date): DealTiming {
  const updatedDate = deal.updated ? new Date(deal.updated) : todayDate;
  const daysSinceLastActivity = Math.floor(
    (todayDate.getTime() - updatedDate.getTime()) / MS_PER_DAY
  );
  const timing: DealTiming = {
    daysSinceLastActivity,
    daysInCurrentStage: daysSinceLastActivity,
  };
  if (deal.close_date && deal.close_date.trim() !== "") {
    timing.daysToClose = Math.floor(
      (new Date(deal.close_date).getTime() - todayDate.getTime()) / MS_PER_DAY
    );
  }
  return timing;
}

/** Structural/sentiment context that makes the score honest (issue #54). */
export interface DealHealthContext {
  hasEconomicBuyer?: boolean | undefined;
  hasChampion?: boolean | undefined;
  lastTouchSentiment?: TouchSentiment | undefined;
  /** Real stage dwell (from snapshots); falls back to activity-based timing. */
  daysInCurrentStage?: number | undefined;
}

/**
 * Score a deal using timing derived from `todayDate` plus optional structural
 * context. When `context` is omitted the structural/sentiment components are
 * neutral, so timing-only callers stay backward compatible.
 */
export function scoreDealForToday(
  deal: PipelineDeal,
  todayDate: Date,
  context: DealHealthContext = {}
): DealHealthScore {
  const timing = deriveDealTiming(deal, todayDate);
  return scoreDeal(deal, {
    daysSinceLastActivity: timing.daysSinceLastActivity,
    daysInCurrentStage: context.daysInCurrentStage ?? timing.daysInCurrentStage,
    ...(timing.daysToClose !== undefined ? { daysToClose: timing.daysToClose } : {}),
    ...(deal.probability !== undefined ? { probability: deal.probability } : {}),
    ...(context.hasEconomicBuyer !== undefined
      ? { hasEconomicBuyer: context.hasEconomicBuyer }
      : {}),
    ...(context.hasChampion !== undefined ? { hasChampion: context.hasChampion } : {}),
    ...(context.lastTouchSentiment !== undefined
      ? { lastTouchSentiment: context.lastTouchSentiment }
      : {}),
  });
}

/**
 * Extract the most recent touchpoint's `**Summary:**` text from a customer's
 * interactions.md content. New interactions are prepended, so the first match
 * is the latest. Returns undefined when none is present.
 */
export function latestTouchSummary(interactionsContent: string): string | undefined {
  const match = interactionsContent.match(/^\*\*Summary:\*\*\s*(.+)$/m);
  return match?.[1]?.trim();
}

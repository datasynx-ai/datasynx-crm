import type { PipelineDeal } from "../schemas/pipeline.js";

export interface DealHealthSignals {
  daysSinceLastActivity: number;
  daysInCurrentStage: number;
  daysToClose?: number | undefined;
  probability?: number | undefined;
}

export interface DealHealthScore {
  score: number; // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  signals: DealHealthSignals;
  warnings: string[];
}

function grade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

export function scoreDeal(deal: PipelineDeal, signals: DealHealthSignals): DealHealthScore {
  let score = 100;
  const warnings: string[] = [];

  // Activity recency (max penalty -40)
  if (signals.daysSinceLastActivity > 60) {
    score -= 40;
    warnings.push(`No activity in ${signals.daysSinceLastActivity} days`);
  } else if (signals.daysSinceLastActivity > 30) {
    score -= 25;
    warnings.push(`Low activity — last touch ${signals.daysSinceLastActivity} days ago`);
  } else if (signals.daysSinceLastActivity > 14) {
    score -= 10;
  }

  // Stage stagnation (max penalty -25)
  if (signals.daysInCurrentStage > 90) {
    score -= 25;
    warnings.push(`Stuck in "${deal.stage}" for ${signals.daysInCurrentStage} days`);
  } else if (signals.daysInCurrentStage > 45) {
    score -= 12;
    warnings.push(`Slow progress in "${deal.stage}"`);
  }

  // Close date risk (max penalty -20)
  if (signals.daysToClose !== undefined) {
    if (signals.daysToClose < 0) {
      score -= 20;
      warnings.push("Close date passed");
    } else if (signals.daysToClose < 7) {
      score -= 10;
      warnings.push("Close date in less than 7 days");
    }
  }

  // Probability sanity (max penalty -15)
  if (signals.probability !== undefined) {
    if (signals.probability < 20 && deal.stage !== "lead") {
      score -= 15;
      warnings.push(`Low probability (${signals.probability}%) for stage "${deal.stage}"`);
    }
  }

  score = Math.max(0, score);
  return { score, grade: grade(score), signals, warnings };
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

/** Score a deal using timing derived from `todayDate` plus the deal's probability. */
export function scoreDealForToday(deal: PipelineDeal, todayDate: Date): DealHealthScore {
  const timing = deriveDealTiming(deal, todayDate);
  return scoreDeal(deal, {
    daysSinceLastActivity: timing.daysSinceLastActivity,
    daysInCurrentStage: timing.daysInCurrentStage,
    ...(timing.daysToClose !== undefined ? { daysToClose: timing.daysToClose } : {}),
    ...(deal.probability !== undefined ? { probability: deal.probability } : {}),
  });
}

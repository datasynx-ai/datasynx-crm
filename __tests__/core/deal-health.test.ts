import { describe, it, expect } from "vitest";
import {
  scoreDeal,
  detectTouchSentiment,
  DEAL_HEALTH_WEIGHTS,
} from "../../src/core/deal-health.js";
import type { PipelineDeal } from "../../src/schemas/pipeline.js";

const baseDeal: PipelineDeal = {
  name: "Test Deal",
  stage: "proposal",
  currency: "EUR",
  updated: "2026-05-27",
  probability: 60,
  value: 50000,
};

// Fully-covered, fresh signals — the all-green baseline.
const healthy = {
  daysSinceLastActivity: 0,
  daysInCurrentStage: 0,
  daysToClose: 30,
  probability: 60,
  hasEconomicBuyer: true,
  hasChampion: true,
  lastTouchSentiment: "positive" as const,
};

describe("scoreDeal — v2 weighted model", () => {
  it("documents weights that sum to 1.0", () => {
    const sum = Object.values(DEAL_HEALTH_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("a fresh, fully-covered deal scores 100/A with no warnings", () => {
    const result = scoreDeal(baseDeal, healthy);
    expect(result.score).toBe(100);
    expect(result.grade).toBe("A");
    expect(result.warnings).toHaveLength(0);
  });

  // ─── The issue #54 reproduction ────────────────────────────────────────────
  it("does NOT give an A to a negotiation deal missing the economic buyer (repro)", () => {
    const result = scoreDeal(
      { ...baseDeal, stage: "negotiation", probability: 75 },
      {
        daysSinceLastActivity: 0,
        daysInCurrentStage: 0,
        probability: 75,
        hasEconomicBuyer: false,
        hasChampion: false,
        lastTouchSentiment: "negative",
      }
    );
    // .30*25 + .20*100 + .15*100 + .15*40 + .10*100 + .10*100 = 68.5 → 69
    expect(result.score).toBe(69);
    expect(result.grade).not.toBe("A");
    expect(result.warnings.some((w) => /economic buyer/i.test(w))).toBe(true);
    expect(result.warnings.some((w) => /champion/i.test(w))).toBe(true);
    expect(result.warnings.some((w) => /risk signal|sentiment|touchpoint/i.test(w))).toBe(true);
  });

  it("hard rule: caps an otherwise-perfect negotiation deal at B when no economic buyer", () => {
    const result = scoreDeal(
      { ...baseDeal, stage: "negotiation", probability: 75 },
      { ...healthy, probability: 75, hasEconomicBuyer: false, hasChampion: true }
    );
    // stakeholder 50, rest 100 → .30*50 + .70*100 = 85 (would be A) → capped to B
    expect(result.score).toBe(85);
    expect(result.grade).toBe("B");
    expect(result.warnings.some((w) => /economic buyer/i.test(w))).toBe(true);
  });

  it("does NOT apply a stakeholder malus on early (lead) stages", () => {
    const result = scoreDeal(
      { ...baseDeal, stage: "lead", probability: 10 },
      {
        daysSinceLastActivity: 5,
        daysInCurrentStage: 10,
        probability: 10,
        hasEconomicBuyer: false,
        hasChampion: false,
        lastTouchSentiment: "neutral",
      }
    );
    expect(result.score).toBe(100);
    expect(result.warnings.some((w) => /economic buyer|champion/i.test(w))).toBe(false);
  });

  it("treats unknown stakeholders (undefined) as no malus — backward compatible", () => {
    // No structural fields → only timing factors apply.
    const result = scoreDeal(baseDeal, { daysSinceLastActivity: 5, daysInCurrentStage: 10 });
    expect(result.score).toBe(100);
    expect(result.grade).toBe("A");
  });

  // ─── Individual timing components (structural unknown) ───────────────────────
  it("penalizes 60+ days inactivity (recency → 0, weight 0.20)", () => {
    const result = scoreDeal(baseDeal, { daysSinceLastActivity: 65, daysInCurrentStage: 10 });
    expect(result.score).toBe(80); // 100 - 0.20*100
    expect(result.warnings.some((w) => w.includes("65 days"))).toBe(true);
  });

  it("penalizes stage stagnation over 90 days (dwell → 30, weight 0.15)", () => {
    const result = scoreDeal(baseDeal, { daysSinceLastActivity: 5, daysInCurrentStage: 95 });
    expect(result.score).toBe(90); // 100 - 0.15*70
    expect(result.warnings.some((w) => w.includes("Stuck in"))).toBe(true);
  });

  it("penalizes an overdue close date (close → 40, weight 0.10)", () => {
    const result = scoreDeal(baseDeal, {
      daysSinceLastActivity: 5,
      daysInCurrentStage: 10,
      daysToClose: -5,
    });
    expect(result.score).toBe(94); // 100 - 0.10*60
    expect(result.warnings.some((w) => w.includes("Close date passed"))).toBe(true);
  });

  it("penalizes a probability far below the stage expectation (prob → 50, weight 0.10)", () => {
    const result = scoreDeal(baseDeal, {
      daysSinceLastActivity: 5,
      daysInCurrentStage: 10,
      probability: 10, // proposal expects ~50
    });
    expect(result.score).toBe(95); // 100 - 0.10*50
    expect(result.warnings.some((w) => /low probability/i.test(w))).toBe(true);
  });

  it("does NOT penalize low probability on the lead stage", () => {
    const result = scoreDeal(
      { ...baseDeal, stage: "lead" },
      { daysSinceLastActivity: 5, daysInCurrentStage: 10, probability: 5 }
    );
    expect(result.score).toBe(100);
  });

  it("score never goes below 0", () => {
    const result = scoreDeal(
      { ...baseDeal, stage: "negotiation" },
      {
        daysSinceLastActivity: 999,
        daysInCurrentStage: 999,
        daysToClose: -999,
        probability: 1,
        hasEconomicBuyer: false,
        hasChampion: false,
        lastTouchSentiment: "negative",
      }
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.grade).toBe("F");
  });

  it("returns the signals it scored", () => {
    const signals = { daysSinceLastActivity: 5, daysInCurrentStage: 10, daysToClose: 30 };
    const result = scoreDeal(baseDeal, signals);
    expect(result.signals).toEqual(signals);
  });
});

describe("detectTouchSentiment", () => {
  it("flags budget/competition objections as negative", () => {
    expect(detectTouchSentiment("CFO äußert Budget-Bedenken")).toBe("negative");
    expect(detectTouchSentiment("Customer says we are too expensive vs competitor")).toBe(
      "negative"
    );
    expect(detectTouchSentiment("Deal on hold until next quarter")).toBe("negative");
  });

  it("flags clear positives", () => {
    expect(detectTouchSentiment("Budget confirmed, contract signed!")).toBe("positive");
  });

  it("returns neutral for ordinary updates and empty text", () => {
    expect(detectTouchSentiment("Discussed integration timeline and next steps")).toBe("neutral");
    expect(detectTouchSentiment("")).toBe("neutral");
  });
});

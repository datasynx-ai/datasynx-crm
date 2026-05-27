import { describe, it, expect } from "vitest";
import { scoreDeal } from "../../src/core/deal-health.js";
import type { PipelineDeal } from "../../src/schemas/pipeline.js";

const baseDeal: PipelineDeal = {
  name: "Test Deal",
  stage: "proposal",
  currency: "EUR",
  updated: "2026-05-27",
  probability: 60,
  value: 50000,
};

describe("scoreDeal", () => {
  it("score is 100 for fresh deal with no warnings", () => {
    const result = scoreDeal(baseDeal, {
      daysSinceLastActivity: 5,
      daysInCurrentStage: 10,
      daysToClose: 30,
      probability: 60,
    });
    expect(result.score).toBe(100);
    expect(result.grade).toBe("A");
    expect(result.warnings).toHaveLength(0);
  });

  it("penalizes deals with 60+ days of inactivity (-40)", () => {
    const result = scoreDeal(baseDeal, {
      daysSinceLastActivity: 65,
      daysInCurrentStage: 10,
    });
    expect(result.score).toBe(60); // 100 - 40
    expect(result.warnings.some((w) => w.includes("65 days"))).toBe(true);
  });

  it("penalizes deals with 31-60 days of inactivity (-25)", () => {
    const result = scoreDeal(baseDeal, {
      daysSinceLastActivity: 35,
      daysInCurrentStage: 10,
    });
    expect(result.score).toBe(75); // 100 - 25
    expect(result.warnings.some((w) => w.includes("Low activity"))).toBe(true);
  });

  it("penalizes deals with 15-30 days of inactivity (-10)", () => {
    const result = scoreDeal(baseDeal, {
      daysSinceLastActivity: 20,
      daysInCurrentStage: 10,
    });
    expect(result.score).toBe(90); // 100 - 10
    expect(result.warnings).toHaveLength(0); // no warning, just penalty
  });

  it("penalizes stage stagnation over 90 days (-25)", () => {
    const result = scoreDeal(baseDeal, {
      daysSinceLastActivity: 5,
      daysInCurrentStage: 95,
    });
    expect(result.score).toBe(75); // 100 - 25
    expect(result.warnings.some((w) => w.includes("Stuck in"))).toBe(true);
  });

  it("penalizes stage stagnation 46-90 days (-12)", () => {
    const result = scoreDeal(baseDeal, {
      daysSinceLastActivity: 5,
      daysInCurrentStage: 50,
    });
    expect(result.score).toBe(88); // 100 - 12
    expect(result.warnings.some((w) => w.includes("Slow progress"))).toBe(true);
  });

  it("penalizes overdue close date (-20)", () => {
    const result = scoreDeal(baseDeal, {
      daysSinceLastActivity: 5,
      daysInCurrentStage: 10,
      daysToClose: -5,
    });
    expect(result.score).toBe(80); // 100 - 20
    expect(result.warnings.some((w) => w.includes("Close date passed"))).toBe(true);
  });

  it("penalizes close date less than 7 days away (-10)", () => {
    const result = scoreDeal(baseDeal, {
      daysSinceLastActivity: 5,
      daysInCurrentStage: 10,
      daysToClose: 3,
    });
    expect(result.score).toBe(90); // 100 - 10
    expect(result.warnings.some((w) => w.includes("less than 7 days"))).toBe(true);
  });

  it("penalizes low probability for non-lead stage (-15)", () => {
    const result = scoreDeal(baseDeal, {
      daysSinceLastActivity: 5,
      daysInCurrentStage: 10,
      probability: 10,
    });
    expect(result.score).toBe(85); // 100 - 15
    expect(result.warnings.some((w) => w.includes("Low probability"))).toBe(true);
  });

  it("does NOT penalize low probability for lead stage", () => {
    const leadDeal = { ...baseDeal, stage: "lead" as const };
    const result = scoreDeal(leadDeal, {
      daysSinceLastActivity: 5,
      daysInCurrentStage: 10,
      probability: 5,
    });
    expect(result.score).toBe(100);
    expect(result.warnings).toHaveLength(0);
  });

  it("grade A >= 80", () => {
    const result = scoreDeal(baseDeal, { daysSinceLastActivity: 5, daysInCurrentStage: 10 });
    expect(result.grade).toBe("A");
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("grade F for score < 35", () => {
    const result = scoreDeal(baseDeal, {
      daysSinceLastActivity: 65, // -40
      daysInCurrentStage: 95,   // -25
      daysToClose: -10,          // -20
      probability: 5,            // -15
    });
    // 100 - 40 - 25 - 20 - 15 = 0
    expect(result.score).toBe(0);
    expect(result.grade).toBe("F");
  });

  it("score never goes below 0", () => {
    const result = scoreDeal(baseDeal, {
      daysSinceLastActivity: 999,
      daysInCurrentStage: 999,
      daysToClose: -999,
      probability: 1,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("returns signals in the result", () => {
    const signals = { daysSinceLastActivity: 5, daysInCurrentStage: 10, daysToClose: 30 };
    const result = scoreDeal(baseDeal, signals);
    expect(result.signals).toEqual(signals);
  });
});

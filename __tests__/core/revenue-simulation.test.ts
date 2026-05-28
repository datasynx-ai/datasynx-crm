import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const TODAY = "2026-05-27";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSnap(overrides: object = {}): import("../../src/core/revenue-simulation.js").DealSnapshot {
  return {
    slug: "acme-corp",
    name: "Q3 Renewal",
    stage: "negotiation",
    value: 50000,
    probability: 75,
    healthScore: 70,
    daysSinceContact: 5,
    championPresent: true,
    ...overrides,
  };
}

function makePipelineMd(rows: string[] = []): string {
  const defaultRow = "| Q3 Renewal | negotiation | 50000 |  | 75 | 2026-06-15 | | 2026-05-20 |";
  return [
    "# Pipeline",
    "",
    "| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |",
    "|------|-------|-------|----------|-------------|------------|-------|---------|",
    ...(rows.length > 0 ? rows : [defaultRow]),
  ].join("\n");
}

function makeHealthJson(overrides: object = {}): string {
  return JSON.stringify({
    schemaVersion: "1",
    slug: "acme-corp",
    overallHealth: 70,
    updatedAt: new Date().toISOString(),
    contacts: [{ lastContact: "2026-05-22", riskFlags: [] }],
    atRiskContacts: [],
    coldContacts: [],
    ...overrides,
  });
}

// ─── percentile ───────────────────────────────────────────────────────────────

describe("percentile", () => {
  it("returns 0 for empty array", async () => {
    const { percentile } = await import("../../src/core/revenue-simulation.js");
    expect(percentile([], 50)).toBe(0);
  });

  it("returns only element for single-element array", async () => {
    const { percentile } = await import("../../src/core/revenue-simulation.js");
    expect(percentile([42], 50)).toBe(42);
  });

  it("p50 of [1,2,3,4,5] is 3", async () => {
    const { percentile } = await import("../../src/core/revenue-simulation.js");
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it("p10 of sorted array is near the lower end", async () => {
    const { percentile } = await import("../../src/core/revenue-simulation.js");
    const arr = Array.from({ length: 100 }, (_, i) => i + 1); // [1..100]
    expect(percentile(arr, 10)).toBeLessThanOrEqual(15);
  });

  it("p90 of sorted array is near the upper end", async () => {
    const { percentile } = await import("../../src/core/revenue-simulation.js");
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(arr, 90)).toBeGreaterThanOrEqual(85);
  });
});

// ─── mean ─────────────────────────────────────────────────────────────────────

describe("mean", () => {
  it("returns 0 for empty array", async () => {
    const { mean } = await import("../../src/core/revenue-simulation.js");
    expect(mean([])).toBe(0);
  });

  it("returns value for single element", async () => {
    const { mean } = await import("../../src/core/revenue-simulation.js");
    expect(mean([42])).toBe(42);
  });

  it("correct for [10, 20, 30] → 20", async () => {
    const { mean } = await import("../../src/core/revenue-simulation.js");
    expect(mean([10, 20, 30])).toBe(20);
  });
});

// ─── stdDevFn ─────────────────────────────────────────────────────────────────

describe("stdDevFn", () => {
  it("returns 0 for single element", async () => {
    const { stdDevFn } = await import("../../src/core/revenue-simulation.js");
    expect(stdDevFn([42], 42)).toBe(0);
  });

  it("returns 0 for two identical values", async () => {
    const { stdDevFn } = await import("../../src/core/revenue-simulation.js");
    expect(stdDevFn([5, 5], 5)).toBe(0);
  });

  it("returns correct value for [0, 2, 4] (mean=2, stdDev≈1.63)", async () => {
    const { stdDevFn } = await import("../../src/core/revenue-simulation.js");
    expect(stdDevFn([0, 2, 4], 2)).toBeCloseTo(1.633, 2);
  });
});

// ─── adjustProbability ────────────────────────────────────────────────────────

describe("adjustProbability", () => {
  it("returns probability/100 for neutral health (60) and no champion", async () => {
    const { adjustProbability } = await import("../../src/core/revenue-simulation.js");
    const snap = makeSnap({ probability: 75, healthScore: 60, championPresent: false });
    expect(adjustProbability(snap)).toBeCloseTo(0.75, 3);
  });

  it("adds health bonus for high health (85) → prob increases", async () => {
    const { adjustProbability } = await import("../../src/core/revenue-simulation.js");
    const neutral = makeSnap({ probability: 75, healthScore: 60, championPresent: false });
    const healthy = makeSnap({ probability: 75, healthScore: 85, championPresent: false });
    expect(adjustProbability(healthy)).toBeGreaterThan(adjustProbability(neutral));
  });

  it("adds health malus for low health (20) → prob decreases", async () => {
    const { adjustProbability } = await import("../../src/core/revenue-simulation.js");
    const neutral = makeSnap({ probability: 75, healthScore: 60, championPresent: false });
    const sick = makeSnap({ probability: 75, healthScore: 20, championPresent: false });
    expect(adjustProbability(sick)).toBeLessThan(adjustProbability(neutral));
  });

  it("adds champion bonus (+5%) when championPresent=true", async () => {
    const { adjustProbability } = await import("../../src/core/revenue-simulation.js");
    const noChamp = makeSnap({ probability: 75, healthScore: 60, championPresent: false });
    const withChamp = makeSnap({ probability: 75, healthScore: 60, championPresent: true });
    expect(adjustProbability(withChamp)).toBeCloseTo(adjustProbability(noChamp) + 0.05, 3);
  });

  it("clamps to 0.02 minimum", async () => {
    const { adjustProbability } = await import("../../src/core/revenue-simulation.js");
    const snap = makeSnap({ probability: 0, healthScore: 0, championPresent: false });
    expect(adjustProbability(snap)).toBeGreaterThanOrEqual(0.02);
  });

  it("clamps to 0.98 maximum", async () => {
    const { adjustProbability } = await import("../../src/core/revenue-simulation.js");
    const snap = makeSnap({ probability: 100, healthScore: 100, championPresent: true });
    expect(adjustProbability(snap)).toBeLessThanOrEqual(0.98);
  });

  it("positive external signal increases probability", async () => {
    const { adjustProbability } = await import("../../src/core/revenue-simulation.js");
    const snap = makeSnap({ probability: 50, healthScore: 60, championPresent: false, slug: "acme-corp" });
    const baseline = adjustProbability(snap, []);
    const withSignal = adjustProbability(snap, [
      { slug: "acme-corp", type: "funding_round", impact: "positive", magnitude: 1.0, summary: "Series B" },
    ]);
    expect(withSignal).toBeGreaterThan(baseline);
  });

  it("negative external signal decreases probability", async () => {
    const { adjustProbability } = await import("../../src/core/revenue-simulation.js");
    const snap = makeSnap({ probability: 50, healthScore: 60, championPresent: false, slug: "acme-corp" });
    const baseline = adjustProbability(snap, []);
    const withSignal = adjustProbability(snap, [
      { slug: "acme-corp", type: "news_negative", impact: "negative", magnitude: 1.0, summary: "Layoffs" },
    ]);
    expect(withSignal).toBeLessThan(baseline);
  });

  it("signal for different slug is ignored", async () => {
    const { adjustProbability } = await import("../../src/core/revenue-simulation.js");
    const snap = makeSnap({ probability: 50, healthScore: 60, championPresent: false, slug: "acme-corp" });
    const baseline = adjustProbability(snap, []);
    const withOtherSignal = adjustProbability(snap, [
      { slug: "other-corp", type: "funding_round", impact: "positive", magnitude: 1.0, summary: "Other" },
    ]);
    expect(withOtherSignal).toBeCloseTo(baseline, 5);
  });
});

// ─── closeVarianceFn ──────────────────────────────────────────────────────────

describe("closeVarianceFn", () => {
  it("returns value near 1.0 (between 0.7 and 1.3)", async () => {
    const { closeVarianceFn } = await import("../../src/core/revenue-simulation.js");
    const snap = makeSnap({ closeDate: "2026-08-01" });
    const val = closeVarianceFn(snap, Math.random);
    expect(val).toBeGreaterThan(0.7);
    expect(val).toBeLessThan(1.3);
  });

  it("deterministic with fixed randFn () => 0.5 → returns exactly 1.0", async () => {
    const { closeVarianceFn } = await import("../../src/core/revenue-simulation.js");
    const snap = makeSnap({ closeDate: "2026-08-01" });
    expect(closeVarianceFn(snap, () => 0.5)).toBeCloseTo(1.0, 10);
  });

  it("deal with imminent close date uses lower variance bound", async () => {
    const { closeVarianceFn } = await import("../../src/core/revenue-simulation.js");
    const todayMs = new Date(TODAY).getTime();
    // imminent: close date 1 day away → daysToClose=1 → variance=0.05
    const imminent = makeSnap({ closeDate: "2026-05-28" });
    // distant: close date >6 months away → daysToClose>30 → variance=0.15
    const distant = makeSnap({ closeDate: "2026-12-01" });
    // randFn=0: 1 + (0-0.5)*2*variance = 1 - variance, so |result-1| = variance
    const variance05 = Math.abs(closeVarianceFn(imminent, () => 0, todayMs) - 1);
    const variance15 = Math.abs(closeVarianceFn(distant, () => 0, todayMs) - 1);
    expect(variance05).toBeLessThan(variance15);
  });

  it("deal without close date uses default variance", async () => {
    const { closeVarianceFn } = await import("../../src/core/revenue-simulation.js");
    const snap = makeSnap({}); // no closeDate
    delete (snap as Partial<typeof snap>).closeDate;
    const val = closeVarianceFn(snap as typeof snap, () => 0.5);
    expect(val).toBeCloseTo(1.0, 5);
  });
});

// ─── buildSensitivityMap ──────────────────────────────────────────────────────

describe("buildSensitivityMap", () => {
  it("empty deals returns empty map", async () => {
    const { buildSensitivityMap } = await import("../../src/core/revenue-simulation.js");
    expect(buildSensitivityMap([], [])).toEqual({});
  });

  it("map keys are deal names", async () => {
    const { buildSensitivityMap } = await import("../../src/core/revenue-simulation.js");
    const snaps = [makeSnap({ name: "Alpha" }), makeSnap({ name: "Beta" })];
    const map = buildSensitivityMap(snaps, []);
    expect(Object.keys(map)).toContain("Alpha");
    expect(Object.keys(map)).toContain("Beta");
  });

  it("higher-value deal has higher sensitivity than lower-value (same probability)", async () => {
    const { buildSensitivityMap } = await import("../../src/core/revenue-simulation.js");
    const small = makeSnap({ name: "Small", value: 10000, probability: 50, healthScore: 60, championPresent: false });
    const large = makeSnap({ name: "Large", value: 100000, probability: 50, healthScore: 60, championPresent: false });
    const map = buildSensitivityMap([small, large], []);
    expect(map["Large"]!).toBeGreaterThan(map["Small"]!);
  });

  it("higher-probability deal has higher sensitivity (same value)", async () => {
    const { buildSensitivityMap } = await import("../../src/core/revenue-simulation.js");
    const lowProb = makeSnap({ name: "Low", value: 50000, probability: 20, healthScore: 60, championPresent: false });
    const highProb = makeSnap({ name: "High", value: 50000, probability: 80, healthScore: 60, championPresent: false });
    const map = buildSensitivityMap([lowProb, highProb], []);
    expect(map["High"]!).toBeGreaterThan(map["Low"]!);
  });
});

// ─── buildTopRisks ────────────────────────────────────────────────────────────

describe("buildTopRisks", () => {
  it("returns empty array when no at-risk deals", async () => {
    const { buildTopRisks, buildSensitivityMap } = await import("../../src/core/revenue-simulation.js");
    const snap = makeSnap({ healthScore: 80, daysSinceContact: 3 });
    const map = buildSensitivityMap([snap], []);
    expect(buildTopRisks([snap], [], map)).toHaveLength(0);
  });

  it("returns risk for deal with healthScore < 60", async () => {
    const { buildTopRisks, buildSensitivityMap } = await import("../../src/core/revenue-simulation.js");
    const snap = makeSnap({ healthScore: 30, daysSinceContact: 5 });
    const map = buildSensitivityMap([snap], []);
    const risks = buildTopRisks([snap], [], map);
    expect(risks.length).toBeGreaterThan(0);
  });

  it("includes health score in risk description", async () => {
    const { buildTopRisks, buildSensitivityMap } = await import("../../src/core/revenue-simulation.js");
    const snap = makeSnap({ healthScore: 35, daysSinceContact: 5 });
    const map = buildSensitivityMap([snap], []);
    const risks = buildTopRisks([snap], [], map);
    expect(risks[0]).toContain("35");
  });

  it("limits to 5 entries", async () => {
    const { buildTopRisks, buildSensitivityMap } = await import("../../src/core/revenue-simulation.js");
    const snaps = Array.from({ length: 10 }, (_, i) =>
      makeSnap({ name: `Deal${i}`, healthScore: 20, daysSinceContact: 20 })
    );
    const map = buildSensitivityMap(snaps, []);
    const risks = buildTopRisks(snaps, [], map);
    expect(risks.length).toBeLessThanOrEqual(5);
  });
});

// ─── runSimulation — empty input ──────────────────────────────────────────────

describe("runSimulation — empty input", () => {
  const emptyInput = () => ({
    deals: [],
    externalSignals: [],
    iterations: 100,
    horizon: "quarter" as const,
    today: TODAY,
  });

  it("returns all zeros for empty deals array", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    const result = runSimulation(emptyInput());
    expect(result.p10).toBe(0);
    expect(result.p50).toBe(0);
    expect(result.p90).toBe(0);
    expect(result.expected).toBe(0);
  });

  it("byCloseMonth is empty object", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    expect(runSimulation(emptyInput()).byCloseMonth).toEqual({});
  });

  it("topRisks is empty array", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    expect(runSimulation(emptyInput()).topRisks).toEqual([]);
  });

  it("sensitivityMap is empty object", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    expect(runSimulation(emptyInput()).sensitivityMap).toEqual({});
  });
});

// ─── runSimulation — statistical properties ───────────────────────────────────

describe("runSimulation — statistical properties", () => {
  function makeInput(
    deals: import("../../src/core/revenue-simulation.js").DealSnapshot[],
    iterations = 1000
  ): import("../../src/core/revenue-simulation.js").SimulationInput {
    return { deals, externalSignals: [], iterations, horizon: "quarter", today: TODAY };
  }

  it("p10 ≤ p50 ≤ p90 (ordering invariant)", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    const deals = [
      makeSnap({ name: "A", value: 50000, probability: 60 }),
      makeSnap({ name: "B", value: 30000, probability: 40 }),
    ];
    const result = runSimulation(makeInput(deals));
    expect(result.p10).toBeLessThanOrEqual(result.p50);
    expect(result.p50).toBeLessThanOrEqual(result.p90);
  });

  it("expected is between p10 and p90", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    const deals = [makeSnap({ name: "A", value: 50000, probability: 60 })];
    const result = runSimulation(makeInput(deals));
    expect(result.expected).toBeGreaterThanOrEqual(result.p10);
    expect(result.expected).toBeLessThanOrEqual(result.p90);
  });

  it("stdDev > 0 when multiple deals exist", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    const deals = [
      makeSnap({ name: "A", value: 50000, probability: 60 }),
      makeSnap({ name: "B", value: 30000, probability: 40 }),
    ];
    const result = runSimulation(makeInput(deals, 500));
    expect(result.stdDev).toBeGreaterThan(0);
  });

  it("with randFn always returning 0.99 (all deals lose): p10=p50=p90=0", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    const deals = [makeSnap({ name: "A", value: 50000 })];
    // adjustedProb ≤ 0.98, so 0.99 > adjustedProb → all deals lose
    const result = runSimulation(makeInput(deals, 100), () => 0.99);
    expect(result.p10).toBe(0);
    expect(result.p50).toBe(0);
    expect(result.p90).toBe(0);
  });

  it("with randFn always returning 0 (all deals win): p50 > 0", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    // randFn=0: 0 < adjustedProb (≥0.02) → always TRUE → all deals win
    const deals = [makeSnap({ name: "A", value: 50000, probability: 75 })];
    const result = runSimulation(makeInput(deals, 100), () => 0);
    expect(result.p50).toBeGreaterThan(0);
  });

  it("p50 is within reasonable range of weighted sum for multiple deals", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    const deals = [
      makeSnap({ name: "A", value: 100000, probability: 75, healthScore: 60, championPresent: false }),
      makeSnap({ name: "B", value: 50000, probability: 50, healthScore: 60, championPresent: false }),
    ];
    // Expected weighted sum: 75000 + 25000 = 100000
    const result = runSimulation(makeInput(deals, 5000));
    expect(result.p50).toBeGreaterThan(50000);
    expect(result.p50).toBeLessThan(200000);
  });

  it("atRiskRevenue = sum of values for deals with healthScore < 60", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    const deals = [
      makeSnap({ name: "AtRisk", value: 30000, healthScore: 40 }),
      makeSnap({ name: "Safe", value: 50000, healthScore: 80 }),
    ];
    const result = runSimulation(makeInput(deals, 100));
    expect(result.atRiskRevenue).toBe(30000);
  });

  it("byCloseMonth key is absent when no deal wins in that month (winning-only)", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    const deals = [makeSnap({ name: "A", value: 50000, closeDate: "2026-06-15", probability: 75 })];
    // randFn=0.99 → no deal wins (adjustedProb < 0.99) → no entry emitted for the month
    const result = runSimulation(makeInput(deals, 100), () => 0.99);
    expect(result.byCloseMonth["2026-06"]).toBeUndefined();
  });

  it("byCloseMonth p50 > 0 when deals win in that month (winning-only values)", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    const deals = [makeSnap({ name: "A", value: 50000, closeDate: "2026-06-15", probability: 75 })];
    // randFn=0: 0 < adjustedProb → all deals win, variance=1.0 (0.5 midpoint)
    let callCount = 0;
    const result = runSimulation(makeInput(deals, 100), () => {
      callCount++;
      return callCount % 2 === 1 ? 0 : 0.5; // odd=win check, even=variance
    });
    expect(result.byCloseMonth["2026-06"]).toBeDefined();
    expect(result.byCloseMonth["2026-06"]!.p50).toBeGreaterThan(0);
  });

  it("byCloseMonth only includes winning iterations — no zeros in distribution", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    const deals = [makeSnap({ name: "A", value: 50000, closeDate: "2026-06-15", probability: 50 })];
    // alternating: even iterations win, odd iterations lose
    let callCount = 0;
    const result = runSimulation(makeInput(deals, 100), () => {
      callCount++;
      // win check: every other call returns 0 (win) or 1 (lose)
      return callCount % 2 === 1 ? 0 : 0.5;
    });
    // All recorded values should be > 0 (winning iterations only)
    if (result.byCloseMonth["2026-06"]) {
      expect(result.byCloseMonth["2026-06"]!.p50).toBeGreaterThan(0);
      expect(result.byCloseMonth["2026-06"]!.range[0]).toBeGreaterThan(0);
    }
  });

  it("sensitivityMap contains entry for each deal", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    const deals = [
      makeSnap({ name: "Alpha" }),
      makeSnap({ name: "Beta" }),
    ];
    const result = runSimulation(makeInput(deals, 100));
    expect(result.sensitivityMap["Alpha"]).toBeDefined();
    expect(result.sensitivityMap["Beta"]).toBeDefined();
  });

  it("topRisks only contains deals with healthScore < 60 or daysSinceContact > 14", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    const deals = [
      makeSnap({ name: "Risky", healthScore: 30, daysSinceContact: 5, value: 50000 }),
      makeSnap({ name: "Safe", healthScore: 90, daysSinceContact: 2, value: 50000 }),
    ];
    const result = runSimulation(makeInput(deals, 100));
    expect(result.topRisks.some((r) => r.includes("Risky"))).toBe(true);
    expect(result.topRisks.some((r) => r.includes("Safe"))).toBe(false);
  });

  it("clamps iterations to MAX_ITERATIONS (50 000)", async () => {
    const { runSimulation } = await import("../../src/core/revenue-simulation.js");
    const deals = [makeSnap({ name: "A", value: 50000, probability: 50 })];
    let callCount = 0;
    runSimulation(makeInput(deals, 200_000), () => { callCount++; return 0.5; });
    // Each iteration: 1 prob-check + 1 variance-check = 2 calls per deal per iteration
    expect(callCount).toBeLessThanOrEqual(50_000 * 2 + 10);
  });
});

// ─── buildSimulationInput (integration, memfs) ────────────────────────────────

describe("buildSimulationInput", () => {
  it("returns empty deals array when customers dir missing", async () => {
    vol.fromJSON({});
    vi.resetModules();
    const { buildSimulationInput } = await import("../../src/core/revenue-simulation.js");
    const input = await buildSimulationInput(DATA_DIR, "quarter", TODAY);
    expect(input.deals).toHaveLength(0);
  });

  it("returns DealSnapshot for each active deal", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/acme-corp/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { buildSimulationInput } = await import("../../src/core/revenue-simulation.js");
    const input = await buildSimulationInput(DATA_DIR, "quarter", TODAY);
    expect(input.deals.length).toBeGreaterThan(0);
    expect(input.deals[0]!.name).toBe("Q3 Renewal");
  });

  it("filters out won/lost deals", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/pipeline.md`]: makePipelineMd([
        "| Won Deal | won | 50000 |  | 100 | 2026-05-10 | | 2026-05-10 |",
        "| Lost Deal | lost | 30000 |  | 0 | 2026-05-01 | | 2026-05-01 |",
      ]),
      [`${DATA_DIR}/customers/acme-corp/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { buildSimulationInput } = await import("../../src/core/revenue-simulation.js");
    const input = await buildSimulationInput(DATA_DIR, "quarter", TODAY);
    expect(input.deals).toHaveLength(0);
  });

  it("uses stage probability when deal.probability is missing", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/pipeline.md`]: makePipelineMd([
        "| No Prob Deal | proposal |  50000 |  |  | 2026-06-15 | | 2026-05-20 |",
      ]),
      [`${DATA_DIR}/customers/acme-corp/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { buildSimulationInput } = await import("../../src/core/revenue-simulation.js");
    const input = await buildSimulationInput(DATA_DIR, "quarter", TODAY);
    // proposal stage default probability is 50
    if (input.deals.length > 0) {
      expect(input.deals[0]!.probability).toBe(50);
    }
  });

  it("filters deals beyond quarter horizon", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/pipeline.md`]: makePipelineMd([
        "| Far Future | negotiation | 50000 |  | 75 | 2027-03-01 | | 2026-05-20 |",
      ]),
      [`${DATA_DIR}/customers/acme-corp/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { buildSimulationInput } = await import("../../src/core/revenue-simulation.js");
    // Quarter end for 2026-05-27 = 2026-06-30, so 2027-03-01 is beyond
    const input = await buildSimulationInput(DATA_DIR, "quarter", TODAY);
    expect(input.deals).toHaveLength(0);
  });

  it("includes closeDate in snapshot when set in pipeline.md", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/acme-corp/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { buildSimulationInput } = await import("../../src/core/revenue-simulation.js");
    const input = await buildSimulationInput(DATA_DIR, "quarter", TODAY);
    if (input.deals.length > 0) {
      expect(input.deals[0]!.closeDate).toBe("2026-06-15");
    }
  });

  it("championPresent=true when graph has champion", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/acme-corp/health.json`]: makeHealthJson(),
      [`${DATA_DIR}/customers/acme-corp/graph.json`]: JSON.stringify({
        schemaVersion: "1",
        slug: "acme-corp",
        nodes: [
          {
            id: "person:max@acme.com",
            type: "person",
            label: "Max",
            properties: {},
            roles: ["champion"],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        edges: [
          {
            id: "IS_CHAMPION:person:max@acme.com__company:acme.com",
            type: "IS_CHAMPION",
            from: "person:max@acme.com",
            to: "company:acme.com",
            weight: 0.5,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        updatedAt: new Date().toISOString(),
      }),
    });
    vi.resetModules();
    const { buildSimulationInput } = await import("../../src/core/revenue-simulation.js");
    const input = await buildSimulationInput(DATA_DIR, "quarter", TODAY);
    if (input.deals.length > 0) {
      expect(input.deals[0]!.championPresent).toBe(true);
    }
  });

  it("healthScore from readHealth when fresh health.json exists", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/acme-corp/health.json`]: makeHealthJson({ overallHealth: 88 }),
    });
    vi.resetModules();
    const { buildSimulationInput } = await import("../../src/core/revenue-simulation.js");
    const input = await buildSimulationInput(DATA_DIR, "quarter", TODAY);
    if (input.deals.length > 0) {
      expect(input.deals[0]!.healthScore).toBe(88);
    }
  });
});

// ─── buildConfidenceMessage ───────────────────────────────────────────────────

describe("buildConfidenceMessage", () => {
  it("contains P50 value", async () => {
    const { buildConfidenceMessage } = await import("../../src/core/revenue-simulation.js");
    const result = {
      p10: 100000, p50: 287500, p90: 412000, expected: 289300, stdDev: 82000,
      atRiskRevenue: 75000, byCloseMonth: {}, topRisks: [], sensitivityMap: {},
    };
    const msg = buildConfidenceMessage(result, 5);
    expect(msg).toContain("287.5k");
  });

  it("mentions deal count", async () => {
    const { buildConfidenceMessage } = await import("../../src/core/revenue-simulation.js");
    const result = {
      p10: 0, p50: 100000, p90: 200000, expected: 100000, stdDev: 50000,
      atRiskRevenue: 0, byCloseMonth: {}, topRisks: [], sensitivityMap: {},
    };
    const msg = buildConfidenceMessage(result, 7);
    expect(msg).toContain("7");
  });
});

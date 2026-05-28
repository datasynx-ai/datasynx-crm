import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";

function makeDeal(overrides: object = {}): import("../../src/core/revenue-simulation.js").DealSnapshot {
  return {
    slug: "acme-corp",
    name: "Enterprise License",
    stage: "negotiation",
    value: 75000,
    probability: 60,
    healthScore: 50,
    daysSinceContact: 5,
    championPresent: false,
    ...overrides,
  };
}

// ─── makeGoalId ───────────────────────────────────────────────────────────────

describe("makeGoalId", () => {
  it("starts with 'goal_' and contains only safe characters", async () => {
    const { makeGoalId } = await import("../../src/core/goal-engine.js");
    const id = makeGoalId();
    expect(id).toMatch(/^goal_\d+_[0-9a-f]+$/);
  });

  it("two calls produce different IDs", async () => {
    const { makeGoalId } = await import("../../src/core/goal-engine.js");
    expect(makeGoalId()).not.toBe(makeGoalId());
  });
});

// ─── goalsPath / readGoals / writeGoals ───────────────────────────────────────

describe("goalsPath", () => {
  it("returns .agentic/goals.json path", async () => {
    const { goalsPath } = await import("../../src/core/goal-engine.js");
    expect(goalsPath(DATA_DIR)).toBe(`${DATA_DIR}/.agentic/goals.json`);
  });
});

describe("readGoals / writeGoals", () => {
  it("readGoals returns [] when file missing", async () => {
    vol.fromJSON({});
    const { readGoals } = await import("../../src/core/goal-engine.js");
    expect(readGoals(DATA_DIR)).toEqual([]);
  });

  it("readGoals returns [] on corrupted JSON", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/goals.json`]: "not-json{{{" });
    const { readGoals } = await import("../../src/core/goal-engine.js");
    expect(readGoals(DATA_DIR)).toEqual([]);
  });

  it("writeGoals / readGoals roundtrip", async () => {
    vol.fromJSON({});
    const { writeGoals, readGoals, makeGoalId } = await import("../../src/core/goal-engine.js");
    const goal = {
      id: makeGoalId(),
      description: "Close €500k",
      type: "revenue" as const,
      target: 500000,
      metric: "revenue" as const,
      deadline: "2026-09-30",
      decomposition: {
        analysis: "Gap: €213k",
        currentPipeline: 287000,
        gap: 213000,
        subGoals: [],
        probabilisticOutcome: "~€512k",
        decomposedAt: "2026-05-27T12:00:00Z",
      },
      progress: 0,
      status: "active" as const,
      createdAt: "2026-05-27T12:00:00Z",
      updatedAt: "2026-05-27T12:00:00Z",
      actor: "alice",
    };
    writeGoals(DATA_DIR, [goal]);
    const result = readGoals(DATA_DIR);
    expect(result).toHaveLength(1);
    expect(result[0]!.description).toBe("Close €500k");
    expect(result[0]!.target).toBe(500000);
  });
});

// ─── parseTargetFromDescription ───────────────────────────────────────────────

describe("parseTargetFromDescription", () => {
  it("parses €500k", async () => {
    const { parseTargetFromDescription } = await import("../../src/core/goal-engine.js");
    expect(parseTargetFromDescription("Close €500k this quarter")).toBe(500000);
  });

  it("parses $2M", async () => {
    const { parseTargetFromDescription } = await import("../../src/core/goal-engine.js");
    expect(parseTargetFromDescription("$2M ARR this year")).toBe(2000000);
  });

  it("parses €1.5 million", async () => {
    const { parseTargetFromDescription } = await import("../../src/core/goal-engine.js");
    expect(parseTargetFromDescription("€1.5 million revenue")).toBe(1500000);
  });

  it("parses bare €75000", async () => {
    const { parseTargetFromDescription } = await import("../../src/core/goal-engine.js");
    expect(parseTargetFromDescription("Book €75000 of new business")).toBe(75000);
  });

  it("parses 500k without currency symbol", async () => {
    const { parseTargetFromDescription } = await import("../../src/core/goal-engine.js");
    expect(parseTargetFromDescription("Close 500k pipeline")).toBe(500000);
  });

  it("returns 0 when no number found", async () => {
    const { parseTargetFromDescription } = await import("../../src/core/goal-engine.js");
    expect(parseTargetFromDescription("No number here at all")).toBe(0);
  });
});

// ─── inferGoalType ────────────────────────────────────────────────────────────

describe("inferGoalType", () => {
  it("'Close €500k ARR' → revenue", async () => {
    const { inferGoalType } = await import("../../src/core/goal-engine.js");
    expect(inferGoalType("Close €500k ARR")).toBe("revenue");
  });

  it("'Build €200k pipeline' → pipeline", async () => {
    const { inferGoalType } = await import("../../src/core/goal-engine.js");
    expect(inferGoalType("Build €200k pipeline")).toBe("pipeline");
  });

  it("'Book 10 meetings this month' → relationship", async () => {
    const { inferGoalType } = await import("../../src/core/goal-engine.js");
    expect(inferGoalType("Book 10 meetings this month")).toBe("relationship");
  });

  it("'Retain churning customers' → churn_prevention", async () => {
    const { inferGoalType } = await import("../../src/core/goal-engine.js");
    expect(inferGoalType("Retain churning customers")).toBe("churn_prevention");
  });
});

// ─── rankDealsByLeverage ──────────────────────────────────────────────────────

describe("rankDealsByLeverage", () => {
  it("ranks highest weighted-value deal first", async () => {
    const { rankDealsByLeverage } = await import("../../src/core/goal-engine.js");
    const deals = [
      makeDeal({ name: "Small", value: 10000, probability: 80, healthScore: 80 }),
      makeDeal({ name: "Big", value: 100000, probability: 70, healthScore: 70 }),
    ];
    const ranked = rankDealsByLeverage(deals);
    expect(ranked[0]!.name).toBe("Big");
  });

  it("filters out won and lost deals", async () => {
    const { rankDealsByLeverage } = await import("../../src/core/goal-engine.js");
    const deals = [
      makeDeal({ name: "Won", stage: "won" }),
      makeDeal({ name: "Lost", stage: "lost" }),
      makeDeal({ name: "Active", stage: "negotiation" }),
    ];
    const ranked = rankDealsByLeverage(deals);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.name).toBe("Active");
  });

  it("zero-probability deal ranks last", async () => {
    const { rankDealsByLeverage } = await import("../../src/core/goal-engine.js");
    const deals = [
      makeDeal({ name: "Zero", value: 200000, probability: 0, healthScore: 50 }),
      makeDeal({ name: "Active", value: 50000, probability: 60, healthScore: 50 }),
    ];
    const ranked = rankDealsByLeverage(deals);
    expect(ranked[0]!.name).toBe("Active");
  });
});

// ─── decomposeGoalRuleBased ───────────────────────────────────────────────────

describe("decomposeGoalRuleBased", () => {
  it("generates sub-goals covering the gap", async () => {
    const { decomposeGoalRuleBased } = await import("../../src/core/goal-engine.js");
    const deals = [
      makeDeal({ slug: "a", name: "Deal A", value: 80000, probability: 70, healthScore: 60 }),
      makeDeal({ slug: "b", name: "Deal B", value: 60000, probability: 60, healthScore: 50 }),
    ];
    const decomp = decomposeGoalRuleBased(deals, 500000, 300000, "2026-05-27");
    expect(decomp.gap).toBe(200000);
    expect(decomp.subGoals.length).toBeGreaterThan(0);
    expect(decomp.subGoals[0]!.priority).toBe(1);
  });

  it("returns empty subGoals when gap already covered", async () => {
    const { decomposeGoalRuleBased } = await import("../../src/core/goal-engine.js");
    const decomp = decomposeGoalRuleBased([], 300000, 400000, "2026-05-27");
    expect(decomp.gap).toBe(0);
    expect(decomp.subGoals).toHaveLength(0);
    expect(decomp.analysis).toContain("already");
  });

  it("generates 'build pipeline' sub-goal when no active deals", async () => {
    const { decomposeGoalRuleBased } = await import("../../src/core/goal-engine.js");
    const decomp = decomposeGoalRuleBased([], 500000, 0, "2026-05-27");
    expect(decomp.subGoals).toHaveLength(1);
    expect(decomp.subGoals[0]!.slug).toBe("_all");
    expect(decomp.subGoals[0]!.action.toLowerCase()).toContain("pipeline");
  });

  it("caps sub-goals at 5 even with more deals", async () => {
    const { decomposeGoalRuleBased } = await import("../../src/core/goal-engine.js");
    const deals = Array.from({ length: 10 }, (_, i) =>
      makeDeal({ slug: `cust-${i}`, name: `Deal ${i}`, value: 50000, probability: 60, healthScore: 50 })
    );
    const decomp = decomposeGoalRuleBased(deals, 5000000, 0, "2026-05-27");
    expect(decomp.subGoals.length).toBeLessThanOrEqual(5);
  });

  it("sub-goal targetDelta sum >= gap when enough deals exist", async () => {
    const { decomposeGoalRuleBased } = await import("../../src/core/goal-engine.js");
    const deals = [
      makeDeal({ slug: "a", name: "A", value: 120000, probability: 80, healthScore: 70 }),
      makeDeal({ slug: "b", name: "B", value: 120000, probability: 80, healthScore: 70 }),
    ];
    const decomp = decomposeGoalRuleBased(deals, 500000, 300000, "2026-05-27");
    const totalDelta = decomp.subGoals.reduce((s, g) => s + g.targetDelta, 0);
    expect(totalDelta).toBeGreaterThanOrEqual(decomp.gap);
  });

  it("uses playbookLookup hook when provided", async () => {
    const { decomposeGoalRuleBased } = await import("../../src/core/goal-engine.js");
    const deals = [makeDeal({ slug: "acme", name: "Deal", value: 80000, probability: 60, healthScore: 50 })];
    const decomp = decomposeGoalRuleBased(
      deals, 500000, 0, "2026-05-27",
      (_slug, _deal) => "enterprise-renewal"
    );
    expect(decomp.subGoals[0]!.playbookName).toBe("enterprise-renewal");
  });
});

// ─── parseLlmDecomposition ────────────────────────────────────────────────────

describe("parseLlmDecomposition", () => {
  const fallback = {
    analysis: "fallback",
    currentPipeline: 0,
    gap: 500000,
    subGoals: [],
    probabilisticOutcome: "unknown",
    decomposedAt: "2026-05-27T00:00:00Z",
  };

  it("parses valid LLM JSON response", async () => {
    const { parseLlmDecomposition } = await import("../../src/core/goal-engine.js");
    const response = JSON.stringify({
      analysis: "Gap: €213k",
      subGoals: [
        { priority: 1, action: "Accelerate deal", slug: "acme", why: "High value", nextStep: "Call buyer", targetDelta: 75000 }
      ],
      probabilisticOutcome: "~€512k",
    });
    const result = parseLlmDecomposition(response, fallback);
    expect(result.analysis).toBe("Gap: €213k");
    expect(result.subGoals).toHaveLength(1);
    expect(result.subGoals[0]!.slug).toBe("acme");
  });

  it("extracts JSON embedded in surrounding text", async () => {
    const { parseLlmDecomposition } = await import("../../src/core/goal-engine.js");
    const inner = JSON.stringify({ analysis: "ok", subGoals: [], probabilisticOutcome: "x" });
    const result = parseLlmDecomposition(`Here is the plan:\n${inner}\nDone.`, fallback);
    expect(result.analysis).toBe("ok");
  });

  it("returns fallback for invalid JSON", async () => {
    const { parseLlmDecomposition } = await import("../../src/core/goal-engine.js");
    const result = parseLlmDecomposition("Not JSON at all.", fallback);
    expect(result.analysis).toBe("fallback");
    expect(result.subGoals).toHaveLength(0);
  });

  it("returns fallback when subGoals array missing", async () => {
    const { parseLlmDecomposition } = await import("../../src/core/goal-engine.js");
    const response = JSON.stringify({ analysis: "ok", probabilisticOutcome: "x" });
    const result = parseLlmDecomposition(response, fallback);
    expect(result.analysis).toBe("fallback");
  });
});

// ─── pursueGoal (integration, memfs) ─────────────────────────────────────────

describe("pursueGoal", () => {
  const mockBuildFn = async () => ({
    deals: [makeDeal({ slug: "acme", name: "Enterprise", value: 80000, probability: 60, healthScore: 50 })],
    externalSignals: [] as [],
    iterations: 100,
    horizon: "quarter" as const,
    today: "2026-05-27",
  });

  it("writes goal to goals.json and returns Goal object", async () => {
    vol.fromJSON({});
    const { pursueGoal, readGoals } = await import("../../src/core/goal-engine.js");
    const goal = await pursueGoal(
      DATA_DIR,
      { description: "Close €500k this quarter", deadline: "2026-09-30" },
      { buildInputFn: mockBuildFn }
    );
    expect(goal.status).toBe("active");
    expect(goal.target).toBe(500000);
    expect(goal.id).toMatch(/^goal_/);
    const stored = readGoals(DATA_DIR);
    expect(stored).toHaveLength(1);
  });

  it("goal has correct type and metric inferred from description", async () => {
    vol.fromJSON({});
    const { pursueGoal } = await import("../../src/core/goal-engine.js");
    const goal = await pursueGoal(
      DATA_DIR,
      { description: "Close €500k ARR this quarter", deadline: "2026-09-30" },
      { buildInputFn: mockBuildFn }
    );
    expect(goal.type).toBe("revenue");
    expect(goal.metric).toBe("revenue");
  });

  it("falls back to rule-based decomposition when llmFn returns unparseable", async () => {
    vol.fromJSON({});
    const { pursueGoal } = await import("../../src/core/goal-engine.js");
    const goal = await pursueGoal(
      DATA_DIR,
      { description: "Close €100k this quarter", deadline: "2026-09-30" },
      { buildInputFn: mockBuildFn, llmFn: async () => "Not valid JSON" }
    );
    expect(goal.decomposition.subGoals.length).toBeGreaterThanOrEqual(0);
    expect(goal.status).toBe("active");
  });

  it("stores actor from options", async () => {
    vol.fromJSON({});
    const { pursueGoal } = await import("../../src/core/goal-engine.js");
    const goal = await pursueGoal(
      DATA_DIR,
      { description: "Close €200k", deadline: "2026-09-30" },
      { buildInputFn: mockBuildFn, actor: "alice" }
    );
    expect(goal.actor).toBe("alice");
  });

  it("appends to existing goals without overwriting", async () => {
    vol.fromJSON({});
    const { pursueGoal, readGoals } = await import("../../src/core/goal-engine.js");
    await pursueGoal(DATA_DIR, { description: "Close €200k", deadline: "2026-09-30" }, { buildInputFn: mockBuildFn });
    await pursueGoal(DATA_DIR, { description: "Close €300k", deadline: "2026-12-31" }, { buildInputFn: mockBuildFn });
    expect(readGoals(DATA_DIR)).toHaveLength(2);
  });

  it("throws on invalid deadline format", async () => {
    vol.fromJSON({});
    const { pursueGoal } = await import("../../src/core/goal-engine.js");
    await expect(
      pursueGoal(DATA_DIR, { description: "Close €100k", deadline: "not-a-date" }, { buildInputFn: mockBuildFn })
    ).rejects.toThrow("deadline: invalid date");
  });

  it("throws on out-of-range deadline (month 13)", async () => {
    vol.fromJSON({});
    const { pursueGoal } = await import("../../src/core/goal-engine.js");
    await expect(
      pursueGoal(DATA_DIR, { description: "Close €100k", deadline: "2026-13-01" }, { buildInputFn: mockBuildFn })
    ).rejects.toThrow("deadline: invalid date");
  });

  it("concurrent pursueGoal calls all persist without data loss", async () => {
    vol.fromJSON({});
    const { pursueGoal, readGoals } = await import("../../src/core/goal-engine.js");
    await Promise.all([
      pursueGoal(DATA_DIR, { description: "Goal A €100k", deadline: "2026-09-30" }, { buildInputFn: mockBuildFn }),
      pursueGoal(DATA_DIR, { description: "Goal B €200k", deadline: "2026-09-30" }, { buildInputFn: mockBuildFn }),
      pursueGoal(DATA_DIR, { description: "Goal C €300k", deadline: "2026-09-30" }, { buildInputFn: mockBuildFn }),
    ]);
    expect(readGoals(DATA_DIR)).toHaveLength(3);
  });
});

// ─── getActiveGoals / updateGoalProgress / cancelGoal ─────────────────────────

describe("getActiveGoals", () => {
  it("returns [] when no goals", async () => {
    vol.fromJSON({});
    const { getActiveGoals } = await import("../../src/core/goal-engine.js");
    expect(getActiveGoals(DATA_DIR)).toEqual([]);
  });

  it("returns only active goals", async () => {
    vol.fromJSON({});
    const { writeGoals, getActiveGoals, makeGoalId } = await import("../../src/core/goal-engine.js");
    const base = {
      id: makeGoalId(), description: "x", type: "revenue" as const, target: 1,
      metric: "revenue" as const, deadline: "2026-09-30",
      decomposition: { analysis: "", currentPipeline: 0, gap: 0, subGoals: [], probabilisticOutcome: "", decomposedAt: "" },
      progress: 0, createdAt: "", updatedAt: "", actor: "system",
    };
    writeGoals(DATA_DIR, [
      { ...base, id: makeGoalId(), status: "active" as const },
      { ...base, id: makeGoalId(), status: "cancelled" as const },
      { ...base, id: makeGoalId(), status: "completed" as const },
    ]);
    expect(getActiveGoals(DATA_DIR)).toHaveLength(1);
  });
});

describe("updateGoalProgress", () => {
  it("updates progress and returns updated goal", async () => {
    vol.fromJSON({});
    const { pursueGoal, updateGoalProgress } = await import("../../src/core/goal-engine.js");
    const mockBuildFn = async () => ({ deals: [], externalSignals: [] as [], iterations: 100, horizon: "quarter" as const, today: "2026-05-27" });
    const goal = await pursueGoal(DATA_DIR, { description: "Close €100k", deadline: "2026-09-30" }, { buildInputFn: mockBuildFn });
    const updated = await updateGoalProgress(DATA_DIR, goal.id, 45);
    expect(updated).not.toBeNull();
    expect(updated!.progress).toBe(45);
  });

  it("returns null for unknown goalId", async () => {
    vol.fromJSON({});
    const { updateGoalProgress } = await import("../../src/core/goal-engine.js");
    expect(await updateGoalProgress(DATA_DIR, "goal_unknown_123456", 50)).toBeNull();
  });

  it("concurrent progress updates are serialized without data loss", async () => {
    vol.fromJSON({});
    const { pursueGoal, updateGoalProgress, readGoals } = await import("../../src/core/goal-engine.js");
    const mockBuildFn = async () => ({ deals: [], externalSignals: [] as [], iterations: 1, horizon: "quarter" as const, today: "2026-05-27" });
    const goal = await pursueGoal(DATA_DIR, { description: "Close €100k", deadline: "2026-09-30" }, { buildInputFn: mockBuildFn });
    await Promise.all([
      updateGoalProgress(DATA_DIR, goal.id, 25),
      updateGoalProgress(DATA_DIR, goal.id, 50),
      updateGoalProgress(DATA_DIR, goal.id, 75),
    ]);
    const goals = readGoals(DATA_DIR);
    expect(goals).toHaveLength(1);
    expect([25, 50, 75]).toContain(goals[0]!.progress);
  });
});

describe("cancelGoal", () => {
  it("sets status to cancelled", async () => {
    vol.fromJSON({});
    const { pursueGoal, cancelGoal, readGoals } = await import("../../src/core/goal-engine.js");
    const mockBuildFn = async () => ({ deals: [], externalSignals: [] as [], iterations: 100, horizon: "quarter" as const, today: "2026-05-27" });
    const goal = await pursueGoal(DATA_DIR, { description: "Close €100k", deadline: "2026-09-30" }, { buildInputFn: mockBuildFn });
    await cancelGoal(DATA_DIR, goal.id);
    expect(readGoals(DATA_DIR)[0]!.status).toBe("cancelled");
  });

  it("returns null for unknown goalId", async () => {
    vol.fromJSON({});
    const { cancelGoal } = await import("../../src/core/goal-engine.js");
    expect(await cancelGoal(DATA_DIR, "goal_unknown_999999")).toBeNull();
  });
});

// ─── syncGoalProgressFromPipeline ─────────────────────────────────────────────

describe("syncGoalProgressFromPipeline", () => {
  const PIPELINE_MD = [
    "# Pipeline",
    "",
    "| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |",
    "|------|-------|-------|----------|-------------|------------|-------|---------|",
    "| Deal A | won | 30000 |  | 100 | 2026-05-01 | | 2026-05-01 |",
    "| Deal B | won | 20000 |  | 100 | 2026-05-10 | | 2026-05-10 |",
    "| Deal C | negotiation | 50000 |  | 75 | 2026-06-15 | | 2026-05-20 |",
  ].join("\n");

  it("updates progress for active revenue goals based on won deals", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/pipeline.md`]: PIPELINE_MD,
      [`${DATA_DIR}/.agentic/.keep`]: "",
    });
    const { pursueGoal, syncGoalProgressFromPipeline, readGoals } = await import("../../src/core/goal-engine.js");
    const goal = await pursueGoal(
      DATA_DIR,
      { description: "Close €100k revenue by end of Q2", deadline: "2026-06-30" },
      { buildInputFn: async () => ({ deals: [], externalSignals: [], iterations: 100, horizon: "quarter", today: "2026-05-28" }), today: "2026-05-28" }
    );
    await syncGoalProgressFromPipeline(DATA_DIR, "2026-05-28");
    const goals = readGoals(DATA_DIR);
    const updated = goals.find((g) => g.id === goal.id);
    // Won: 30000 + 20000 = 50000, target 100000 → 50%
    expect(updated!.progress).toBeCloseTo(50, 0);
  });

  it("does not update completed or cancelled goals", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/pipeline.md`]: PIPELINE_MD,
      [`${DATA_DIR}/.agentic/.keep`]: "",
    });
    const { pursueGoal, cancelGoal, syncGoalProgressFromPipeline, readGoals } = await import("../../src/core/goal-engine.js");
    const goal = await pursueGoal(
      DATA_DIR,
      { description: "Close €50k revenue by end of Q2", deadline: "2026-06-30" },
      { buildInputFn: async () => ({ deals: [], externalSignals: [], iterations: 100, horizon: "quarter", today: "2026-05-28" }), today: "2026-05-28" }
    );
    await cancelGoal(DATA_DIR, goal.id);
    await syncGoalProgressFromPipeline(DATA_DIR, "2026-05-28");
    const goals = readGoals(DATA_DIR);
    const cancelled = goals.find((g) => g.id === goal.id);
    expect(cancelled!.status).toBe("cancelled");
    expect(cancelled!.progress).toBe(0); // unchanged
  });

  it("returns empty result when no active goals", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/.keep`]: "" });
    const { syncGoalProgressFromPipeline } = await import("../../src/core/goal-engine.js");
    const result = await syncGoalProgressFromPipeline(DATA_DIR, "2026-05-28");
    expect(result).toEqual({ updated: [], skipped: 0 });
  });

  it("clamps progress to 100 when won exceeds target", async () => {
    const bigWinPipeline = [
      "# Pipeline",
      "",
      "| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |",
      "|------|-------|-------|----------|-------------|------------|-------|---------|",
      "| Mega | won | 200000 |  | 100 | 2026-05-01 | | 2026-05-01 |",
    ].join("\n");
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/pipeline.md`]: bigWinPipeline,
      [`${DATA_DIR}/.agentic/.keep`]: "",
    });
    const { pursueGoal, syncGoalProgressFromPipeline, readGoals } = await import("../../src/core/goal-engine.js");
    await pursueGoal(
      DATA_DIR,
      { description: "Close €50k revenue", deadline: "2026-06-30" },
      { buildInputFn: async () => ({ deals: [], externalSignals: [], iterations: 100, horizon: "quarter", today: "2026-05-28" }), today: "2026-05-28" }
    );
    await syncGoalProgressFromPipeline(DATA_DIR, "2026-05-28");
    const goals = readGoals(DATA_DIR);
    expect(goals[0]!.progress).toBe(100);
  });
});

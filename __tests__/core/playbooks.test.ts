import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePlaybookMd(overrides: Partial<{
  trigger: string;
  successRate: number;
  usedCount: number;
  lastUpdated: string;
  body: string;
}> = {}): string {
  const fm = {
    trigger: overrides.trigger ?? "deal_stage_negotiation AND value > 50000",
    successRate: overrides.successRate ?? 0.73,
    usedCount: overrides.usedCount ?? 14,
    lastUpdated: overrides.lastUpdated ?? "2026-05-20",
  };
  const body = overrides.body ?? "# Enterprise Renewal\n\n## Situation\nDeal stalled.\n\n## Steps\n1. Call buyer.";
  return `---\ntrigger: ${fm.trigger}\nsuccessRate: ${fm.successRate}\nusedCount: ${fm.usedCount}\nlastUpdated: ${fm.lastUpdated}\n---\n\n${body}`;
}

function makeDealSnap(overrides: object = {}): import("../../src/core/revenue-simulation.js").DealSnapshot {
  return {
    slug: SLUG,
    name: "Enterprise License",
    stage: "negotiation",
    value: 75000,
    probability: 60,
    healthScore: 45,
    daysSinceContact: 10,
    championPresent: false,
    ...overrides,
  };
}

// ─── parseTrigger ─────────────────────────────────────────────────────────────

describe("parseTrigger", () => {
  it("returns empty array for empty string", async () => {
    const { parseTrigger } = await import("../../src/core/playbooks.js");
    expect(parseTrigger("")).toEqual([]);
  });

  it("parses single deal_stage_ token", async () => {
    const { parseTrigger } = await import("../../src/core/playbooks.js");
    const conds = parseTrigger("deal_stage_negotiation");
    expect(conds).toHaveLength(1);
    expect(conds[0]).toEqual({ type: "stage", stage: "negotiation" });
  });

  it("parses value > n token", async () => {
    const { parseTrigger } = await import("../../src/core/playbooks.js");
    const conds = parseTrigger("value > 50000");
    expect(conds).toHaveLength(1);
    expect(conds[0]).toEqual({ type: "value_gt", value: 50000 });
  });

  it("parses value < n token", async () => {
    const { parseTrigger } = await import("../../src/core/playbooks.js");
    const conds = parseTrigger("value < 10000");
    expect(conds).toHaveLength(1);
    expect(conds[0]).toEqual({ type: "value_lt", value: 10000 });
  });

  it("parses days_stalled > n token", async () => {
    const { parseTrigger } = await import("../../src/core/playbooks.js");
    const conds = parseTrigger("days_stalled > 7");
    expect(conds).toHaveLength(1);
    expect(conds[0]).toEqual({ type: "days_stalled_gt", value: 7 });
  });

  it("parses days_stalled < n token", async () => {
    const { parseTrigger } = await import("../../src/core/playbooks.js");
    const conds = parseTrigger("days_stalled < 3");
    expect(conds[0]).toEqual({ type: "days_stalled_lt", value: 3 });
  });

  it("parses health < n token", async () => {
    const { parseTrigger } = await import("../../src/core/playbooks.js");
    const conds = parseTrigger("health < 60");
    expect(conds[0]).toEqual({ type: "health_lt", value: 60 });
  });

  it("parses health > n token", async () => {
    const { parseTrigger } = await import("../../src/core/playbooks.js");
    const conds = parseTrigger("health > 70");
    expect(conds[0]).toEqual({ type: "health_gt", value: 70 });
  });

  it("parses no_champion token", async () => {
    const { parseTrigger } = await import("../../src/core/playbooks.js");
    const conds = parseTrigger("no_champion");
    expect(conds[0]).toEqual({ type: "no_champion" });
  });

  it("parses has_champion token", async () => {
    const { parseTrigger } = await import("../../src/core/playbooks.js");
    const conds = parseTrigger("has_champion");
    expect(conds[0]).toEqual({ type: "has_champion" });
  });

  it("parses multiple AND conditions", async () => {
    const { parseTrigger } = await import("../../src/core/playbooks.js");
    const conds = parseTrigger("deal_stage_negotiation AND value > 50000 AND days_stalled > 7");
    expect(conds).toHaveLength(3);
    expect(conds[0]).toEqual({ type: "stage", stage: "negotiation" });
    expect(conds[1]).toEqual({ type: "value_gt", value: 50000 });
    expect(conds[2]).toEqual({ type: "days_stalled_gt", value: 7 });
  });

  it("silently drops unknown tokens", async () => {
    const { parseTrigger } = await import("../../src/core/playbooks.js");
    const conds = parseTrigger("deal_stage_negotiation AND unknown_token AND value > 50000");
    expect(conds).toHaveLength(2);
    expect(conds.map((c) => c.type)).toEqual(["stage", "value_gt"]);
  });

  it("tolerates extra spaces around AND", async () => {
    const { parseTrigger } = await import("../../src/core/playbooks.js");
    const conds = parseTrigger("deal_stage_negotiation  AND  value > 50000");
    expect(conds).toHaveLength(2);
  });
});

// ─── evaluateCondition / evaluateTrigger ──────────────────────────────────────

describe("evaluateCondition", () => {
  it("stage: matches when deal.stage equals condition.stage", async () => {
    const { evaluateCondition } = await import("../../src/core/playbooks.js");
    expect(evaluateCondition({ type: "stage", stage: "negotiation" }, makeDealSnap({ stage: "negotiation" }), 0)).toBe(true);
  });

  it("stage: returns false on mismatch", async () => {
    const { evaluateCondition } = await import("../../src/core/playbooks.js");
    expect(evaluateCondition({ type: "stage", stage: "proposal" }, makeDealSnap({ stage: "negotiation" }), 0)).toBe(false);
  });

  it("value_gt: true when deal.value > condition.value", async () => {
    const { evaluateCondition } = await import("../../src/core/playbooks.js");
    expect(evaluateCondition({ type: "value_gt", value: 50000 }, makeDealSnap({ value: 75000 }), 0)).toBe(true);
  });

  it("value_gt: false when deal.value <= condition.value", async () => {
    const { evaluateCondition } = await import("../../src/core/playbooks.js");
    expect(evaluateCondition({ type: "value_gt", value: 75000 }, makeDealSnap({ value: 75000 }), 0)).toBe(false);
  });

  it("value_lt: true when deal.value < condition.value", async () => {
    const { evaluateCondition } = await import("../../src/core/playbooks.js");
    expect(evaluateCondition({ type: "value_lt", value: 100000 }, makeDealSnap({ value: 75000 }), 0)).toBe(true);
  });

  it("days_stalled_gt: uses daysSinceContact as proxy", async () => {
    const { evaluateCondition } = await import("../../src/core/playbooks.js");
    expect(evaluateCondition({ type: "days_stalled_gt", value: 7 }, makeDealSnap(), 10)).toBe(true);
    expect(evaluateCondition({ type: "days_stalled_gt", value: 7 }, makeDealSnap(), 5)).toBe(false);
  });

  it("days_stalled_lt: returns true when daysSinceContact < value", async () => {
    const { evaluateCondition } = await import("../../src/core/playbooks.js");
    expect(evaluateCondition({ type: "days_stalled_lt", value: 14 }, makeDealSnap(), 3)).toBe(true);
    expect(evaluateCondition({ type: "days_stalled_lt", value: 14 }, makeDealSnap(), 20)).toBe(false);
  });

  it("health_lt: matches low health", async () => {
    const { evaluateCondition } = await import("../../src/core/playbooks.js");
    expect(evaluateCondition({ type: "health_lt", value: 60 }, makeDealSnap({ healthScore: 45 }), 0)).toBe(true);
    expect(evaluateCondition({ type: "health_lt", value: 60 }, makeDealSnap({ healthScore: 75 }), 0)).toBe(false);
  });

  it("health_gt: matches high health", async () => {
    const { evaluateCondition } = await import("../../src/core/playbooks.js");
    expect(evaluateCondition({ type: "health_gt", value: 70 }, makeDealSnap({ healthScore: 85 }), 0)).toBe(true);
    expect(evaluateCondition({ type: "health_gt", value: 70 }, makeDealSnap({ healthScore: 60 }), 0)).toBe(false);
  });

  it("no_champion: matches when !deal.championPresent", async () => {
    const { evaluateCondition } = await import("../../src/core/playbooks.js");
    expect(evaluateCondition({ type: "no_champion" }, makeDealSnap({ championPresent: false }), 0)).toBe(true);
    expect(evaluateCondition({ type: "no_champion" }, makeDealSnap({ championPresent: true }), 0)).toBe(false);
  });

  it("has_champion: matches when deal.championPresent", async () => {
    const { evaluateCondition } = await import("../../src/core/playbooks.js");
    expect(evaluateCondition({ type: "has_champion" }, makeDealSnap({ championPresent: true }), 0)).toBe(true);
    expect(evaluateCondition({ type: "has_champion" }, makeDealSnap({ championPresent: false }), 0)).toBe(false);
  });
});

describe("evaluateTrigger", () => {
  it("returns true when all conditions match", async () => {
    const { evaluateTrigger } = await import("../../src/core/playbooks.js");
    const conds = [
      { type: "stage" as const, stage: "negotiation" },
      { type: "value_gt" as const, value: 50000 },
    ];
    expect(evaluateTrigger(conds, makeDealSnap({ stage: "negotiation", value: 75000 }), 0)).toBe(true);
  });

  it("returns false when one condition fails", async () => {
    const { evaluateTrigger } = await import("../../src/core/playbooks.js");
    const conds = [
      { type: "stage" as const, stage: "proposal" },
      { type: "value_gt" as const, value: 50000 },
    ];
    expect(evaluateTrigger(conds, makeDealSnap({ stage: "negotiation", value: 75000 }), 0)).toBe(false);
  });

  it("returns true for empty conditions array", async () => {
    const { evaluateTrigger } = await import("../../src/core/playbooks.js");
    expect(evaluateTrigger([], makeDealSnap(), 0)).toBe(true);
  });
});

// ─── listPlaybooks / readPlaybook / writePlaybook ─────────────────────────────

describe("listPlaybooks", () => {
  it("returns empty array when playbooks dir missing", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/main_facts.md`]: "# Acme" });
    const { listPlaybooks } = await import("../../src/core/playbooks.js");
    expect(listPlaybooks(DATA_DIR, SLUG)).toEqual([]);
  });

  it("returns parsed playbooks from memfs", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/enterprise-renewal.md`]: makePlaybookMd(),
    });
    const { listPlaybooks } = await import("../../src/core/playbooks.js");
    const result = listPlaybooks(DATA_DIR, SLUG);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("enterprise-renewal");
  });

  it("parses YAML frontmatter correctly", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/test.md`]: makePlaybookMd({
        trigger: "deal_stage_proposal",
        successRate: 0.8,
        usedCount: 5,
      }),
    });
    const { listPlaybooks } = await import("../../src/core/playbooks.js");
    const pb = listPlaybooks(DATA_DIR, SLUG)[0]!;
    expect(pb.frontmatter.trigger).toBe("deal_stage_proposal");
    expect(pb.frontmatter.successRate).toBe(0.8);
    expect(pb.frontmatter.usedCount).toBe(5);
  });

  it("includes markdown content without YAML block", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/test.md`]: makePlaybookMd({ body: "# My Playbook\n\nSome steps." }),
    });
    const { listPlaybooks } = await import("../../src/core/playbooks.js");
    const pb = listPlaybooks(DATA_DIR, SLUG)[0]!;
    expect(pb.content).toContain("# My Playbook");
    expect(pb.content).not.toContain("successRate:");
  });
});

describe("readPlaybook", () => {
  it("returns null for missing file", async () => {
    vol.fromJSON({});
    const { readPlaybook } = await import("../../src/core/playbooks.js");
    expect(readPlaybook(DATA_DIR, SLUG, "nonexistent")).toBeNull();
  });

  it("returns playbook with frontmatter and content", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/test.md`]: makePlaybookMd(),
    });
    const { readPlaybook } = await import("../../src/core/playbooks.js");
    const pb = readPlaybook(DATA_DIR, SLUG, "test");
    expect(pb).not.toBeNull();
    expect(pb!.frontmatter.successRate).toBe(0.73);
    expect(pb!.content).toContain("Enterprise Renewal");
  });
});

describe("writePlaybook", () => {
  it("creates file readable back with readPlaybook", async () => {
    vol.fromJSON({});
    const { writePlaybook, readPlaybook } = await import("../../src/core/playbooks.js");
    const today = "2026-05-27";
    const playbook = {
      slug: SLUG,
      name: "my-playbook",
      frontmatter: { trigger: "deal_stage_negotiation", successRate: 0.6, usedCount: 3, lastUpdated: today },
      content: "# My Playbook\n\n## Steps\n1. Do thing.",
      path: `${DATA_DIR}/customers/${SLUG}/playbooks/my-playbook.md`,
    };
    await writePlaybook(DATA_DIR, SLUG, playbook);
    const read = readPlaybook(DATA_DIR, SLUG, "my-playbook");
    expect(read).not.toBeNull();
    expect(read!.frontmatter.trigger).toBe("deal_stage_negotiation");
    expect(read!.content).toContain("Do thing.");
  });

  it("creates playbooks dir if missing", async () => {
    vol.fromJSON({});
    const { writePlaybook, listPlaybooks } = await import("../../src/core/playbooks.js");
    const playbook = {
      slug: SLUG,
      name: "test",
      frontmatter: { trigger: "no_champion", successRate: 0.5, usedCount: 0, lastUpdated: "2026-05-27" },
      content: "# Test",
      path: `${DATA_DIR}/customers/${SLUG}/playbooks/test.md`,
    };
    await writePlaybook(DATA_DIR, SLUG, playbook);
    const all = listPlaybooks(DATA_DIR, SLUG);
    expect(all).toHaveLength(1);
  });

  it("concurrent writes to different playbooks all persist", async () => {
    vol.fromJSON({});
    const { writePlaybook, listPlaybooks } = await import("../../src/core/playbooks.js");
    const base = { slug: SLUG, frontmatter: { trigger: "no_champion", successRate: 0.5, usedCount: 0, lastUpdated: "2026-05-27" }, content: "# Test" };
    await Promise.all([
      writePlaybook(DATA_DIR, SLUG, { ...base, name: "pb-1", path: `${DATA_DIR}/customers/${SLUG}/playbooks/pb-1.md` }),
      writePlaybook(DATA_DIR, SLUG, { ...base, name: "pb-2", path: `${DATA_DIR}/customers/${SLUG}/playbooks/pb-2.md` }),
      writePlaybook(DATA_DIR, SLUG, { ...base, name: "pb-3", path: `${DATA_DIR}/customers/${SLUG}/playbooks/pb-3.md` }),
    ]);
    expect(listPlaybooks(DATA_DIR, SLUG)).toHaveLength(3);
  });
});

// ─── matchPlaybooks / getBestPlaybook ─────────────────────────────────────────

describe("matchPlaybooks", () => {
  it("returns empty when no playbooks", async () => {
    const { matchPlaybooks } = await import("../../src/core/playbooks.js");
    expect(matchPlaybooks([], makeDealSnap(), 0)).toEqual([]);
  });

  it("returns match for exact trigger", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/p1.md`]: makePlaybookMd({ trigger: "deal_stage_negotiation AND value > 50000" }),
    });
    const { listPlaybooks, matchPlaybooks } = await import("../../src/core/playbooks.js");
    const pbs = listPlaybooks(DATA_DIR, SLUG);
    const matches = matchPlaybooks(pbs, makeDealSnap({ stage: "negotiation", value: 75000 }), 0);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.score).toBe(1.0);
  });

  it("excludes partial matches (score < 1.0)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/p1.md`]: makePlaybookMd({ trigger: "deal_stage_proposal AND value > 50000" }),
    });
    const { listPlaybooks, matchPlaybooks } = await import("../../src/core/playbooks.js");
    const pbs = listPlaybooks(DATA_DIR, SLUG);
    // stage=negotiation !== proposal → only 1/2 conditions match
    const matches = matchPlaybooks(pbs, makeDealSnap({ stage: "negotiation", value: 75000 }), 0);
    expect(matches).toHaveLength(0);
  });

  it("sorts by successRate desc", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/low.md`]: makePlaybookMd({ trigger: "deal_stage_negotiation", successRate: 0.4 }),
      [`${DATA_DIR}/customers/${SLUG}/playbooks/high.md`]: makePlaybookMd({ trigger: "deal_stage_negotiation", successRate: 0.9 }),
    });
    const { listPlaybooks, matchPlaybooks } = await import("../../src/core/playbooks.js");
    const pbs = listPlaybooks(DATA_DIR, SLUG);
    const matches = matchPlaybooks(pbs, makeDealSnap({ stage: "negotiation" }), 0);
    expect(matches[0]!.playbook.frontmatter.successRate).toBe(0.9);
  });

  it("sorts by usedCount when successRate tied", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/few.md`]: makePlaybookMd({ trigger: "deal_stage_negotiation", successRate: 0.7, usedCount: 2 }),
      [`${DATA_DIR}/customers/${SLUG}/playbooks/many.md`]: makePlaybookMd({ trigger: "deal_stage_negotiation", successRate: 0.7, usedCount: 20 }),
    });
    const { listPlaybooks, matchPlaybooks } = await import("../../src/core/playbooks.js");
    const pbs = listPlaybooks(DATA_DIR, SLUG);
    const matches = matchPlaybooks(pbs, makeDealSnap({ stage: "negotiation" }), 0);
    expect(matches[0]!.playbook.frontmatter.usedCount).toBe(20);
  });

  it("skips playbook with empty trigger (no conditions to match)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/empty-trigger.md`]: makePlaybookMd({ trigger: "" }),
    });
    const { listPlaybooks, matchPlaybooks } = await import("../../src/core/playbooks.js");
    const pbs = listPlaybooks(DATA_DIR, SLUG);
    const matches = matchPlaybooks(pbs, makeDealSnap(), 0);
    expect(matches).toHaveLength(0);
  });
});

describe("getBestPlaybook", () => {
  it("returns null when no match", async () => {
    vol.fromJSON({});
    const { getBestPlaybook } = await import("../../src/core/playbooks.js");
    expect(getBestPlaybook(DATA_DIR, SLUG, makeDealSnap(), 0)).toBeNull();
  });

  it("returns highest-scoring match", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/p1.md`]: makePlaybookMd({ trigger: "deal_stage_negotiation", successRate: 0.8 }),
      [`${DATA_DIR}/customers/${SLUG}/playbooks/p2.md`]: makePlaybookMd({ trigger: "deal_stage_negotiation AND health < 60", successRate: 0.9 }),
    });
    const { getBestPlaybook } = await import("../../src/core/playbooks.js");
    const best = getBestPlaybook(DATA_DIR, SLUG, makeDealSnap({ stage: "negotiation", healthScore: 45 }), 0);
    expect(best).not.toBeNull();
    expect(best!.playbook.frontmatter.successRate).toBe(0.9);
  });
});

// ─── buildDistillPrompt / parseLlmDistillation ────────────────────────────────

describe("buildDistillPrompt", () => {
  it("includes slug, dealName, outcome, and interactions", async () => {
    const { buildDistillPrompt } = await import("../../src/core/playbooks.js");
    const prompt = buildDistillPrompt("acme-corp", "Enterprise License", "won", "some interactions content");
    expect(prompt).toContain("acme-corp");
    expect(prompt).toContain("Enterprise License");
    expect(prompt).toContain("won");
    expect(prompt).toContain("some interactions content");
  });

  it("includes allowed trigger tokens documentation", async () => {
    const { buildDistillPrompt } = await import("../../src/core/playbooks.js");
    const prompt = buildDistillPrompt("slug", "deal", "lost", "");
    expect(prompt).toContain("deal_stage_");
    expect(prompt).toContain("value >");
    expect(prompt).toContain("days_stalled >");
  });
});

describe("parseLlmDistillation", () => {
  it("parses valid JSON response", async () => {
    const { parseLlmDistillation } = await import("../../src/core/playbooks.js");
    const response = JSON.stringify({
      name: "test-playbook",
      trigger: "deal_stage_negotiation",
      content: "# Test\n\n## Steps\n1. Do thing.",
      successRate: 1.0,
      reasoning: "Won by calling buyer",
    });
    const result = parseLlmDistillation(response, 1.0);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("test-playbook");
    expect(result!.trigger).toBe("deal_stage_negotiation");
  });

  it("parses JSON embedded in surrounding text", async () => {
    const { parseLlmDistillation } = await import("../../src/core/playbooks.js");
    const response = `Here is the playbook:\n${JSON.stringify({ name: "x", trigger: "no_champion", content: "# X", successRate: 0.8, reasoning: "r" })}\nDone.`;
    const result = parseLlmDistillation(response, 0.8);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("x");
  });

  it("returns null for non-JSON response", async () => {
    const { parseLlmDistillation } = await import("../../src/core/playbooks.js");
    expect(parseLlmDistillation("Not a JSON response at all.", 1.0)).toBeNull();
  });

  it("returns null when required fields missing", async () => {
    const { parseLlmDistillation } = await import("../../src/core/playbooks.js");
    const response = JSON.stringify({ trigger: "deal_stage_negotiation", successRate: 1.0 }); // missing name + content
    expect(parseLlmDistillation(response, 1.0)).toBeNull();
  });

  it("uses outcomeFallback when successRate absent from JSON", async () => {
    const { parseLlmDistillation } = await import("../../src/core/playbooks.js");
    const response = JSON.stringify({ name: "x", trigger: "no_champion", content: "# X", reasoning: "r" });
    const result = parseLlmDistillation(response, 0.0);
    expect(result!.successRate).toBe(0.0);
  });
});

// ─── toKebabCase ──────────────────────────────────────────────────────────────

describe("toKebabCase", () => {
  it("converts spaces to hyphens", async () => {
    const { toKebabCase } = await import("../../src/core/playbooks.js");
    expect(toKebabCase("My Playbook Name")).toBe("my-playbook-name");
  });

  it("lowercases all characters", async () => {
    const { toKebabCase } = await import("../../src/core/playbooks.js");
    expect(toKebabCase("UPPERCASE")).toBe("uppercase");
  });

  it("collapses multiple hyphens", async () => {
    const { toKebabCase } = await import("../../src/core/playbooks.js");
    expect(toKebabCase("a---b")).toBe("a-b");
  });

  it("strips leading and trailing hyphens", async () => {
    const { toKebabCase } = await import("../../src/core/playbooks.js");
    expect(toKebabCase("  leading trailing  ")).toBe("leading-trailing");
  });

  it("preserves existing kebab-case", async () => {
    const { toKebabCase } = await import("../../src/core/playbooks.js");
    expect(toKebabCase("already-kebab")).toBe("already-kebab");
  });
});

// ─── parseTriggerFull ─────────────────────────────────────────────────────────

describe("parseTriggerFull", () => {
  it("returns AND operator for AND-separated trigger", async () => {
    const { parseTriggerFull } = await import("../../src/core/playbooks.js");
    const result = parseTriggerFull("deal_stage_negotiation AND value > 50000");
    expect(result.operator).toBe("AND");
    expect(result.conditions).toHaveLength(2);
  });

  it("returns OR operator for OR-separated trigger", async () => {
    const { parseTriggerFull } = await import("../../src/core/playbooks.js");
    const result = parseTriggerFull("deal_stage_negotiation OR no_champion");
    expect(result.operator).toBe("OR");
    expect(result.conditions).toHaveLength(2);
  });

  it("returns AND operator and empty conditions for empty string", async () => {
    const { parseTriggerFull } = await import("../../src/core/playbooks.js");
    const result = parseTriggerFull("");
    expect(result.operator).toBe("AND");
    expect(result.conditions).toHaveLength(0);
  });

  it("parses OR conditions correctly", async () => {
    const { parseTriggerFull } = await import("../../src/core/playbooks.js");
    const result = parseTriggerFull("health < 50 OR days_stalled > 14");
    expect(result.operator).toBe("OR");
    expect(result.conditions[0]).toEqual({ type: "health_lt", value: 50 });
    expect(result.conditions[1]).toEqual({ type: "days_stalled_gt", value: 14 });
  });

  it("single token defaults to AND operator", async () => {
    const { parseTriggerFull } = await import("../../src/core/playbooks.js");
    const result = parseTriggerFull("no_champion");
    expect(result.operator).toBe("AND");
    expect(result.conditions).toHaveLength(1);
  });
});

describe("evaluateTrigger with OR operator", () => {
  it("OR: returns true when any condition matches", async () => {
    const { evaluateTrigger } = await import("../../src/core/playbooks.js");
    const conds = [
      { type: "stage" as const, stage: "proposal" }, // false
      { type: "value_gt" as const, value: 50000 },   // true (deal.value=75000)
    ];
    expect(evaluateTrigger(conds, makeDealSnap({ stage: "negotiation", value: 75000 }), 0, "OR")).toBe(true);
  });

  it("OR: returns false when no condition matches", async () => {
    const { evaluateTrigger } = await import("../../src/core/playbooks.js");
    const conds = [
      { type: "stage" as const, stage: "proposal" },  // false
      { type: "value_gt" as const, value: 100000 },   // false (deal.value=75000)
    ];
    expect(evaluateTrigger(conds, makeDealSnap({ stage: "negotiation", value: 75000 }), 0, "OR")).toBe(false);
  });

  it("AND still requires all conditions to match (default operator unchanged)", async () => {
    const { evaluateTrigger } = await import("../../src/core/playbooks.js");
    const conds = [
      { type: "stage" as const, stage: "negotiation" },
      { type: "value_gt" as const, value: 50000 },
    ];
    expect(evaluateTrigger(conds, makeDealSnap({ stage: "negotiation", value: 75000 }), 0, "AND")).toBe(true);
    expect(evaluateTrigger(conds, makeDealSnap({ stage: "proposal", value: 75000 }), 0, "AND")).toBe(false);
  });
});

describe("matchPlaybooks OR trigger", () => {
  it("matches playbook with OR trigger when one condition is true", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/or-pb.md`]: makePlaybookMd({ trigger: "deal_stage_proposal OR no_champion" }),
    });
    const { listPlaybooks, matchPlaybooks } = await import("../../src/core/playbooks.js");
    const pbs = listPlaybooks(DATA_DIR, SLUG);
    // stage=negotiation (not proposal) but championPresent=false → no_champion matches
    const matches = matchPlaybooks(pbs, makeDealSnap({ stage: "negotiation", championPresent: false }), 0);
    expect(matches).toHaveLength(1);
  });

  it("does not match OR playbook when no condition is true", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/or-pb.md`]: makePlaybookMd({ trigger: "deal_stage_proposal OR has_champion" }),
    });
    const { listPlaybooks, matchPlaybooks } = await import("../../src/core/playbooks.js");
    const pbs = listPlaybooks(DATA_DIR, SLUG);
    // stage=negotiation (not proposal) AND no champion → no match
    const matches = matchPlaybooks(pbs, makeDealSnap({ stage: "negotiation", championPresent: false }), 0);
    expect(matches).toHaveLength(0);
  });

  it("AND playbook still excluded when only partial match", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/and-pb.md`]: makePlaybookMd({ trigger: "deal_stage_proposal AND value > 50000" }),
    });
    const { listPlaybooks, matchPlaybooks } = await import("../../src/core/playbooks.js");
    const pbs = listPlaybooks(DATA_DIR, SLUG);
    // value > 50000 matches but stage=proposal doesn't match negotiation
    const matches = matchPlaybooks(pbs, makeDealSnap({ stage: "negotiation", value: 75000 }), 0);
    expect(matches).toHaveLength(0);
  });
});

// ─── distillPlaybook (integration, memfs) ─────────────────────────────────────

describe("distillPlaybook", () => {
  const validLlmResponse = () => JSON.stringify({
    name: "negotiation-price",
    trigger: "deal_stage_negotiation AND value > 50000",
    content: "# Price Objection\n\n## Steps\n1. Focus on ROI.",
    successRate: 1.0,
    reasoning: "Deal won by ROI framing",
  });

  it("returns errorKind=no_interactions when interactions.md missing", async () => {
    vol.fromJSON({});
    const { distillPlaybook } = await import("../../src/core/playbooks.js");
    const result = await distillPlaybook(DATA_DIR, SLUG, "Test Deal", "won", async () => validLlmResponse());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKind).toBe("no_interactions");
  });

  it("writes playbook file on successful LLM response", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: "## 2026-05-01 · Call\n**Summary:** Good call.",
    });
    const { distillPlaybook, listPlaybooks } = await import("../../src/core/playbooks.js");
    const result = await distillPlaybook(DATA_DIR, SLUG, "Test Deal", "won", async () => validLlmResponse());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.playbook.name).toBe("negotiation-price");
    const all = listPlaybooks(DATA_DIR, SLUG);
    expect(all).toHaveLength(1);
  });

  it("returns errorKind=parse_failed when LLM response unparseable", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: "## 2026-05-01 · Call\n**Summary:** Ok.",
    });
    const { distillPlaybook } = await import("../../src/core/playbooks.js");
    const result = await distillPlaybook(DATA_DIR, SLUG, "Deal", "lost", async () => "Not valid JSON");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKind).toBe("parse_failed");
  });

  it("normalizes name to kebab-case", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: "## 2026-05-01 · Call\n**Summary:** Good.",
    });
    const { distillPlaybook } = await import("../../src/core/playbooks.js");
    const weirdNameResponse = JSON.stringify({
      name: "My Playbook With Spaces",
      trigger: "no_champion",
      content: "# X",
      successRate: 1.0,
      reasoning: "r",
    });
    const result = await distillPlaybook(DATA_DIR, SLUG, "Deal", "won", async () => weirdNameResponse);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.playbook.name).toMatch(/^[a-z0-9-]+$/);
  });

  it("succeeds with empty interactions file (passes empty string to LLM)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: "",
    });
    const { distillPlaybook } = await import("../../src/core/playbooks.js");
    const validResponse = JSON.stringify({
      name: "blank-deal",
      trigger: "deal_stage_lead",
      content: "# Blank Deal\n\n## Steps\n1. Gather info.",
      successRate: 0.5,
      reasoning: "No history available.",
    });
    let capturedPrompt = "";
    const result = await distillPlaybook(DATA_DIR, SLUG, "Deal", "won", async (p) => {
      capturedPrompt = p;
      return validResponse;
    });
    expect(result.ok).toBe(true);
    expect(capturedPrompt).toContain("Deal");
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";
const TODAY = "2026-05-27";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeBlock(date: string, withStr: string, type = "Call"): string {
  return `## ${date} · ${type}
**With:** ${withStr}
**Summary:** Test interaction.
**Next Steps:**
- [ ] Follow up
**Source:** agent://log/1
**Synced:** ${date}T10:00:00.000Z
---
`;
}

function makeEmailBlock(date: string, withStr: string): string {
  return `## ${date} · Email
**Subject:** ${withStr}
**Summary:** Test email.
**Next Steps:**
- [ ] —
**Source:** agent://log/2
**Synced:** ${date}T10:00:00.000Z
---
`;
}

// ─── parseContactInteractions ─────────────────────────────────────────────────

describe("parseContactInteractions", () => {
  it("returns empty array for empty string", async () => {
    const { parseContactInteractions } = await import("../../src/core/relationship-health.js");
    expect(parseContactInteractions("")).toEqual([]);
  });

  it("parses single Call entry — date + type + withStr", async () => {
    const { parseContactInteractions } = await import("../../src/core/relationship-health.js");
    const md = makeBlock("2026-05-27", "Max Müller <max@acme.com>");
    const result = parseContactInteractions(md);
    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe("2026-05-27");
    expect(result[0]!.type).toBe("Call");
    expect(result[0]!.withStr).toBe("Max Müller <max@acme.com>");
  });

  it("parses **With:** label correctly", async () => {
    const { parseContactInteractions } = await import("../../src/core/relationship-health.js");
    const result = parseContactInteractions(makeBlock("2026-05-27", "alice@b.com"));
    expect(result[0]!.withStr).toBe("alice@b.com");
  });

  it("parses **Subject:** label (Email type)", async () => {
    const { parseContactInteractions } = await import("../../src/core/relationship-health.js");
    const result = parseContactInteractions(makeEmailBlock("2026-05-27", "alice@b.com"));
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("Email");
    expect(result[0]!.withStr).toBe("alice@b.com");
  });

  it("parses multiple entries", async () => {
    const { parseContactInteractions } = await import("../../src/core/relationship-health.js");
    const md = makeBlock("2026-05-27", "max@a.com") + makeBlock("2026-05-20", "alice@b.com");
    const result = parseContactInteractions(md);
    expect(result).toHaveLength(2);
  });

  it("skips blocks without **With:** or **Subject:** line", async () => {
    const { parseContactInteractions } = await import("../../src/core/relationship-health.js");
    const bad = `## 2026-05-27 · Call\n**Summary:** no with field\n---\n`;
    expect(parseContactInteractions(bad)).toHaveLength(0);
  });

  it("trims whitespace from withStr", async () => {
    const { parseContactInteractions } = await import("../../src/core/relationship-health.js");
    const md = `## 2026-05-27 · Call\n**With:**   max@acme.com  \n**Summary:** x\n---\n`;
    const result = parseContactInteractions(md);
    expect(result[0]!.withStr).toBe("max@acme.com");
  });
});

// ─── calcRecencyScore ─────────────────────────────────────────────────────────

describe("calcRecencyScore", () => {
  it("returns 100 for 0 days", async () => {
    const { calcRecencyScore } = await import("../../src/core/relationship-health.js");
    expect(calcRecencyScore(0)).toBe(100);
  });

  it("returns 50 for 15 days", async () => {
    const { calcRecencyScore } = await import("../../src/core/relationship-health.js");
    expect(calcRecencyScore(15)).toBe(50);
  });

  it("returns 0 for 30 days", async () => {
    const { calcRecencyScore } = await import("../../src/core/relationship-health.js");
    expect(calcRecencyScore(30)).toBe(0);
  });

  it("returns 0 for 45 days (clamped)", async () => {
    const { calcRecencyScore } = await import("../../src/core/relationship-health.js");
    expect(calcRecencyScore(45)).toBe(0);
  });

  it("returns 0 for 999 days (clamped)", async () => {
    const { calcRecencyScore } = await import("../../src/core/relationship-health.js");
    expect(calcRecencyScore(999)).toBe(0);
  });
});

// ─── calcCadenceScore ─────────────────────────────────────────────────────────

describe("calcCadenceScore", () => {
  it("returns 100 when daysSince <= avgCadenceDays (on-schedule)", async () => {
    const { calcCadenceScore } = await import("../../src/core/relationship-health.js");
    expect(calcCadenceScore(7, 7)).toBe(100);
  });

  it("returns 100 when daysSince = 0", async () => {
    const { calcCadenceScore } = await import("../../src/core/relationship-health.js");
    expect(calcCadenceScore(0, 7)).toBe(100);
  });

  it("returns 50 when avgCadenceDays is 0 (no baseline)", async () => {
    const { calcCadenceScore } = await import("../../src/core/relationship-health.js");
    expect(calcCadenceScore(7, 0)).toBe(50);
  });

  it("returns 50 when daysSince = 2× avgCadenceDays", async () => {
    const { calcCadenceScore } = await import("../../src/core/relationship-health.js");
    expect(calcCadenceScore(14, 7)).toBe(50);
  });

  it("returns 0 when daysSince >= 3× avgCadenceDays", async () => {
    const { calcCadenceScore } = await import("../../src/core/relationship-health.js");
    expect(calcCadenceScore(21, 7)).toBe(0);
  });

  it("returns value between 0 and 100 for intermediate ratio", async () => {
    const { calcCadenceScore } = await import("../../src/core/relationship-health.js");
    const v = calcCadenceScore(10, 7); // ratio ≈ 1.43
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(100);
  });
});

// ─── calcMomentumScore ────────────────────────────────────────────────────────

describe("calcMomentumScore", () => {
  it("returns 50 when both 0 (no history)", async () => {
    const { calcMomentumScore } = await import("../../src/core/relationship-health.js");
    expect(calcMomentumScore(0, 0)).toBe(50);
  });

  it("returns 80 when prev30d = 0 (new contact)", async () => {
    const { calcMomentumScore } = await import("../../src/core/relationship-health.js");
    expect(calcMomentumScore(3, 0)).toBe(80);
  });

  it("returns 100 when last30d >= 1.5× prev30d", async () => {
    const { calcMomentumScore } = await import("../../src/core/relationship-health.js");
    expect(calcMomentumScore(6, 4)).toBe(100);
  });

  it("returns 75 when last30d equals prev30d", async () => {
    const { calcMomentumScore } = await import("../../src/core/relationship-health.js");
    expect(calcMomentumScore(4, 4)).toBe(75);
  });

  it("returns 50 when last30d = 0.5× prev30d", async () => {
    const { calcMomentumScore } = await import("../../src/core/relationship-health.js");
    expect(calcMomentumScore(2, 4)).toBe(50);
  });

  it("returns 25 when last30d = 0.25× prev30d", async () => {
    const { calcMomentumScore } = await import("../../src/core/relationship-health.js");
    expect(calcMomentumScore(1, 4)).toBe(25);
  });

  it("returns 0 when last30d well below 0.25× prev30d", async () => {
    const { calcMomentumScore } = await import("../../src/core/relationship-health.js");
    expect(calcMomentumScore(0, 4)).toBe(0);
  });
});

// ─── calcAvgCadence ───────────────────────────────────────────────────────────

describe("calcAvgCadence", () => {
  it("returns 0 for empty array", async () => {
    const { calcAvgCadence } = await import("../../src/core/relationship-health.js");
    expect(calcAvgCadence([])).toBe(0);
  });

  it("returns 0 for single interaction", async () => {
    const { calcAvgCadence } = await import("../../src/core/relationship-health.js");
    expect(calcAvgCadence([{ date: "2026-05-27", type: "Call", withStr: "a" }])).toBe(0);
  });

  it("returns 7 for two interactions 7 days apart", async () => {
    const { calcAvgCadence } = await import("../../src/core/relationship-health.js");
    const result = calcAvgCadence([
      { date: "2026-05-27", type: "Call", withStr: "a" },
      { date: "2026-05-20", type: "Call", withStr: "a" },
    ]);
    expect(result).toBe(7);
  });

  it("returns rounded average for 3 interactions with unequal gaps", async () => {
    const { calcAvgCadence } = await import("../../src/core/relationship-health.js");
    // gaps: 7 + 10 = 17, avg = 8.5 → round to 9
    const result = calcAvgCadence([
      { date: "2026-05-27", type: "Call", withStr: "a" },
      { date: "2026-05-20", type: "Call", withStr: "a" },
      { date: "2026-05-10", type: "Call", withStr: "a" },
    ]);
    expect(result).toBe(9);
  });

  it("handles interactions given in any order (sorts internally)", async () => {
    const { calcAvgCadence } = await import("../../src/core/relationship-health.js");
    const result = calcAvgCadence([
      { date: "2026-05-10", type: "Call", withStr: "a" },
      { date: "2026-05-27", type: "Call", withStr: "a" },
      { date: "2026-05-20", type: "Call", withStr: "a" },
    ]);
    expect(result).toBe(9);
  });
});

// ─── gradeFromScore ───────────────────────────────────────────────────────────

describe("gradeFromScore", () => {
  it.each([
    [100, "A"], [80, "A"],
    [79, "B"],  [60, "B"],
    [59, "C"],  [40, "C"],
    [39, "D"],  [20, "D"],
    [19, "F"],  [0, "F"],
  ])("score %i → grade %s", async (score, expected) => {
    const { gradeFromScore } = await import("../../src/core/relationship-health.js");
    expect(gradeFromScore(score)).toBe(expected);
  });
});

// ─── trendFromState ───────────────────────────────────────────────────────────

describe("trendFromState", () => {
  it("returns cold when score < 20", async () => {
    const { trendFromState } = await import("../../src/core/relationship-health.js");
    expect(trendFromState(10, 5, 7, 50)).toBe("cold");
  });

  it("returns cold when daysSince >= 30 even if score > 20", async () => {
    const { trendFromState } = await import("../../src/core/relationship-health.js");
    expect(trendFromState(50, 30, 7, 50)).toBe("cold");
  });

  it("returns rising when momentumScore > 70 and score > 60", async () => {
    const { trendFromState } = await import("../../src/core/relationship-health.js");
    expect(trendFromState(70, 3, 7, 80)).toBe("rising");
  });

  it("returns declining when momentumScore < 30", async () => {
    const { trendFromState } = await import("../../src/core/relationship-health.js");
    expect(trendFromState(50, 5, 7, 20)).toBe("declining");
  });

  it("returns declining when daysSince > avgCadence * 1.5 and score < 60", async () => {
    const { trendFromState } = await import("../../src/core/relationship-health.js");
    // daysSince=12 > 7*1.5=10.5, score=50 < 60
    expect(trendFromState(50, 12, 7, 50)).toBe("declining");
  });

  it("returns stable for neutral case", async () => {
    const { trendFromState } = await import("../../src/core/relationship-health.js");
    expect(trendFromState(65, 5, 7, 50)).toBe("stable");
  });
});

// ─── calcRiskFlags ────────────────────────────────────────────────────────────

describe("calcRiskFlags", () => {
  it("sets NO_CONTACT_14D when daysSince >= 14", async () => {
    const { calcRiskFlags } = await import("../../src/core/relationship-health.js");
    expect(calcRiskFlags("p:a", 14, 70, false)).toContain("NO_CONTACT_14D");
  });

  it("sets NO_CONTACT_30D when daysSince >= 30", async () => {
    const { calcRiskFlags } = await import("../../src/core/relationship-health.js");
    expect(calcRiskFlags("p:a", 30, 70, false)).toContain("NO_CONTACT_30D");
  });

  it("sets both NO_CONTACT_14D and NO_CONTACT_30D when daysSince >= 30", async () => {
    const { calcRiskFlags } = await import("../../src/core/relationship-health.js");
    const flags = calcRiskFlags("p:a", 32, 70, false);
    expect(flags).toContain("NO_CONTACT_14D");
    expect(flags).toContain("NO_CONTACT_30D");
  });

  it("sets CHAMPION_SILENT when isChampion = true and score < 50", async () => {
    const { calcRiskFlags } = await import("../../src/core/relationship-health.js");
    expect(calcRiskFlags("p:a", 5, 40, true)).toContain("CHAMPION_SILENT");
  });

  it("does NOT set CHAMPION_SILENT when isChampion = false", async () => {
    const { calcRiskFlags } = await import("../../src/core/relationship-health.js");
    expect(calcRiskFlags("p:a", 5, 40, false)).not.toContain("CHAMPION_SILENT");
  });

  it("does NOT set CHAMPION_SILENT when score >= 50", async () => {
    const { calcRiskFlags } = await import("../../src/core/relationship-health.js");
    expect(calcRiskFlags("p:a", 5, 50, true)).not.toContain("CHAMPION_SILENT");
  });

  it("returns empty array when daysSince < 14 and not champion", async () => {
    const { calcRiskFlags } = await import("../../src/core/relationship-health.js");
    expect(calcRiskFlags("p:a", 5, 70, false)).toEqual([]);
  });
});

// ─── groupInteractionsByContact ───────────────────────────────────────────────

describe("groupInteractionsByContact", () => {
  it("returns empty array for no interactions", async () => {
    const { groupInteractionsByContact } = await import("../../src/core/relationship-health.js");
    expect(groupInteractionsByContact([], SLUG)).toEqual([]);
  });

  it("groups two interactions from the same email into one group", async () => {
    const { groupInteractionsByContact } = await import("../../src/core/relationship-health.js");
    const ixs = [
      { date: "2026-05-27", type: "Call", withStr: "max@acme.com" },
      { date: "2026-05-20", type: "Call", withStr: "max@acme.com" },
    ];
    const groups = groupInteractionsByContact(ixs, SLUG);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.interactions).toHaveLength(2);
  });

  it("creates separate groups for different people", async () => {
    const { groupInteractionsByContact } = await import("../../src/core/relationship-health.js");
    const ixs = [
      { date: "2026-05-27", type: "Call", withStr: "max@acme.com" },
      { date: "2026-05-27", type: "Call", withStr: "alice@acme.com" },
    ];
    expect(groupInteractionsByContact(ixs, SLUG)).toHaveLength(2);
  });

  it("sets email on group when extractable", async () => {
    const { groupInteractionsByContact } = await import("../../src/core/relationship-health.js");
    const groups = groupInteractionsByContact(
      [{ date: "2026-05-27", type: "Call", withStr: "Max <max@acme.com>" }],
      SLUG
    );
    expect(groups[0]!.email).toBe("max@acme.com");
  });

  it("sets name from extractDisplayName", async () => {
    const { groupInteractionsByContact } = await import("../../src/core/relationship-health.js");
    const groups = groupInteractionsByContact(
      [{ date: "2026-05-27", type: "Call", withStr: "Max Müller <max@acme.com>" }],
      SLUG
    );
    expect(groups[0]!.name).toBe("Max Müller");
  });

  it("groups by name-slug when no email", async () => {
    const { groupInteractionsByContact } = await import("../../src/core/relationship-health.js");
    const ixs = [
      { date: "2026-05-27", type: "Call", withStr: "Max Müller" },
      { date: "2026-05-20", type: "Call", withStr: "Max Müller" },
    ];
    expect(groupInteractionsByContact(ixs, SLUG)).toHaveLength(1);
  });
});

// ─── computeContactHealth ─────────────────────────────────────────────────────

describe("computeContactHealth", () => {
  it("score is between 0 and 100", async () => {
    const { computeContactHealth } = await import("../../src/core/relationship-health.js");
    const group = {
      contactId: "person:max@acme.com",
      name: "Max",
      email: "max@acme.com",
      interactions: [{ date: "2026-05-22", type: "Call", withStr: "max@acme.com" }],
    };
    const h = computeContactHealth(group, TODAY, false);
    expect(h.score).toBeGreaterThanOrEqual(0);
    expect(h.score).toBeLessThanOrEqual(100);
  });

  it("grade matches score thresholds", async () => {
    const { computeContactHealth, gradeFromScore } = await import("../../src/core/relationship-health.js");
    const group = {
      contactId: "person:max@acme.com",
      name: "Max",
      interactions: [{ date: TODAY, type: "Call", withStr: "max@acme.com" }],
    };
    const h = computeContactHealth(group, TODAY, false);
    expect(h.grade).toBe(gradeFromScore(h.score));
  });

  it("lastContact is most recent interaction date", async () => {
    const { computeContactHealth } = await import("../../src/core/relationship-health.js");
    const group = {
      contactId: "person:max@acme.com",
      name: "Max",
      interactions: [
        { date: "2026-05-20", type: "Call", withStr: "max@acme.com" },
        { date: "2026-05-27", type: "Call", withStr: "max@acme.com" },
      ],
    };
    const h = computeContactHealth(group, TODAY, false);
    expect(h.lastContact).toBe("2026-05-27");
  });

  it("daysSinceContact correct for given today", async () => {
    const { computeContactHealth } = await import("../../src/core/relationship-health.js");
    const group = {
      contactId: "person:max@acme.com",
      name: "Max",
      interactions: [{ date: "2026-05-22", type: "Call", withStr: "max@acme.com" }],
    };
    const h = computeContactHealth(group, "2026-05-27", false);
    expect(h.daysSinceContact).toBe(5);
  });

  it("interactionCount30d counts correctly", async () => {
    const { computeContactHealth } = await import("../../src/core/relationship-health.js");
    const group = {
      contactId: "person:max@acme.com",
      name: "Max",
      interactions: [
        { date: "2026-05-27", type: "Call", withStr: "max@acme.com" },
        { date: "2026-05-15", type: "Call", withStr: "max@acme.com" },
        { date: "2026-04-01", type: "Call", withStr: "max@acme.com" }, // >30d ago
      ],
    };
    const h = computeContactHealth(group, "2026-05-27", false);
    expect(h.interactionCount30d).toBe(2);
  });

  it("riskFlags includes NO_CONTACT_14D when 14+ days", async () => {
    const { computeContactHealth } = await import("../../src/core/relationship-health.js");
    const group = {
      contactId: "person:max@acme.com",
      name: "Max",
      interactions: [{ date: "2026-05-12", type: "Call", withStr: "max@acme.com" }],
    };
    const h = computeContactHealth(group, "2026-05-27", false); // 15 days
    expect(h.riskFlags).toContain("NO_CONTACT_14D");
  });

  it("riskFlags includes CHAMPION_SILENT when isChampion + low score", async () => {
    const { computeContactHealth } = await import("../../src/core/relationship-health.js");
    const group = {
      contactId: "person:max@acme.com",
      name: "Max",
      interactions: [{ date: "2026-04-01", type: "Call", withStr: "max@acme.com" }], // very old
    };
    const h = computeContactHealth(group, "2026-05-27", true); // isChampion=true
    expect(h.riskFlags).toContain("CHAMPION_SILENT");
  });

  it("recommendation is a non-empty string", async () => {
    const { computeContactHealth } = await import("../../src/core/relationship-health.js");
    const group = {
      contactId: "person:max@acme.com",
      name: "Max",
      interactions: [{ date: TODAY, type: "Call", withStr: "max@acme.com" }],
    };
    const h = computeContactHealth(group, TODAY, false);
    expect(typeof h.recommendation).toBe("string");
    expect(h.recommendation.length).toBeGreaterThan(0);
  });

  it("sentimentTrend is 0 (v1 neutral)", async () => {
    const { computeContactHealth } = await import("../../src/core/relationship-health.js");
    const group = {
      contactId: "person:max@acme.com",
      name: "Max",
      interactions: [{ date: TODAY, type: "Call", withStr: "max@acme.com" }],
    };
    expect(computeContactHealth(group, TODAY, false).sentimentTrend).toBe(0);
  });

  it("trend is cold when daysSince >= 30", async () => {
    const { computeContactHealth } = await import("../../src/core/relationship-health.js");
    const group = {
      contactId: "person:max@acme.com",
      name: "Max",
      interactions: [{ date: "2026-04-20", type: "Call", withStr: "max@acme.com" }], // 37 days
    };
    expect(computeContactHealth(group, "2026-05-27", false).trend).toBe("cold");
  });

  it("sets no email property when group has no email", async () => {
    const { computeContactHealth } = await import("../../src/core/relationship-health.js");
    const group = {
      contactId: "person:acme-corp:max",
      name: "Max",
      interactions: [{ date: TODAY, type: "Call", withStr: "Max" }],
    };
    const h = computeContactHealth(group, TODAY, false);
    expect(Object.prototype.hasOwnProperty.call(h, "email")).toBe(false);
  });
});

// ─── computeCustomerHealth (integration, memfs) ───────────────────────────────

describe("computeCustomerHealth", () => {
  it("returns overallHealth 100 and empty contacts when interactions.md does not exist", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { computeCustomerHealth } = await import("../../src/core/relationship-health.js");
    const h = computeCustomerHealth(DATA_DIR, SLUG, TODAY);
    expect(h.overallHealth).toBe(100);
    expect(h.contacts).toHaveLength(0);
  });

  it("returns one contact per unique person", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]:
        makeBlock("2026-05-27", "max@acme.com") + makeBlock("2026-05-20", "max@acme.com"),
    });
    const { computeCustomerHealth } = await import("../../src/core/relationship-health.js");
    const h = computeCustomerHealth(DATA_DIR, SLUG, TODAY);
    expect(h.contacts).toHaveLength(1);
  });

  it("returns multiple contacts for multiple people", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]:
        makeBlock("2026-05-27", "max@acme.com") + makeBlock("2026-05-27", "alice@acme.com"),
    });
    const { computeCustomerHealth } = await import("../../src/core/relationship-health.js");
    const h = computeCustomerHealth(DATA_DIR, SLUG, TODAY);
    expect(h.contacts).toHaveLength(2);
  });

  it("overallHealth is average of contact scores", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]:
        makeBlock("2026-05-27", "max@acme.com") + makeBlock("2026-05-27", "alice@acme.com"),
    });
    const { computeCustomerHealth } = await import("../../src/core/relationship-health.js");
    const h = computeCustomerHealth(DATA_DIR, SLUG, TODAY);
    const avg = Math.round(h.contacts.reduce((s, c) => s + c.score, 0) / h.contacts.length);
    expect(h.overallHealth).toBe(avg);
  });

  it("uses graph.json IS_CHAMPION edges for CHAMPION_SILENT flag", async () => {
    const graph = {
      schemaVersion: "1", slug: SLUG, updatedAt: TODAY,
      nodes: [{ id: "person:max@acme.com", type: "person", label: "Max", properties: { email: "max@acme.com" }, createdAt: TODAY, updatedAt: TODAY }],
      edges: [{ id: "IS_CHAMPION:person:max@acme.com__deal:d1", from: "person:max@acme.com", to: "deal:d1", type: "IS_CHAMPION", weight: 0.8, sentiment: 0, lastContact: TODAY, contactCount: 1, properties: {} }],
    };
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: JSON.stringify(graph),
      // Old interaction → score will be low → CHAMPION_SILENT should trigger
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: makeBlock("2026-04-01", "max@acme.com"),
    });
    const { computeCustomerHealth } = await import("../../src/core/relationship-health.js");
    const h = computeCustomerHealth(DATA_DIR, SLUG, TODAY);
    const contact = h.contacts.find((c) => c.contactId === "person:max@acme.com");
    expect(contact?.riskFlags).toContain("CHAMPION_SILENT");
  });

  it("handles missing graph.json gracefully (empty graph, no champion flags)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: makeBlock("2026-05-27", "max@acme.com"),
    });
    const { computeCustomerHealth } = await import("../../src/core/relationship-health.js");
    await expect(() => computeCustomerHealth(DATA_DIR, SLUG, TODAY)).not.toThrow();
  });

  it("does not throw when customers dir does not exist", async () => {
    vol.fromJSON({});
    const { computeCustomerHealth } = await import("../../src/core/relationship-health.js");
    expect(() => computeCustomerHealth(DATA_DIR, SLUG, TODAY)).not.toThrow();
  });
});

// ─── readHealth / writeHealth ─────────────────────────────────────────────────

describe("readHealth / writeHealth", () => {
  it("returns null when health.json does not exist", async () => {
    vol.fromJSON({});
    const { readHealth } = await import("../../src/core/relationship-health.js");
    expect(readHealth(DATA_DIR, SLUG)).toBeNull();
  });

  it("written health is readable via memfs", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { readHealth, writeHealth } = await import("../../src/core/relationship-health.js");
    const snapshot = {
      schemaVersion: "1" as const,
      slug: SLUG,
      contacts: [],
      overallHealth: 72,
      updatedAt: TODAY + "T00:00:00.000Z",
    };
    writeHealth(DATA_DIR, SLUG, snapshot);
    const read = readHealth(DATA_DIR, SLUG);
    expect(read?.overallHealth).toBe(72);
    expect(read?.slug).toBe(SLUG);
  });

  it("updatedAt is refreshed on write", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { readHealth, writeHealth } = await import("../../src/core/relationship-health.js");
    const snapshot = {
      schemaVersion: "1" as const,
      slug: SLUG,
      contacts: [],
      overallHealth: 50,
      updatedAt: "2020-01-01T00:00:00.000Z",
    };
    writeHealth(DATA_DIR, SLUG, snapshot);
    const read = readHealth(DATA_DIR, SLUG);
    expect(read?.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("returns null on corrupted health.json", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/health.json`]: "not-json{{{" });
    const { readHealth } = await import("../../src/core/relationship-health.js");
    expect(readHealth(DATA_DIR, SLUG)).toBeNull();
  });
});

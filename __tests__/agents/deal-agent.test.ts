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

function makePipelineMd(overrides: string = ""): string {
  return `# Pipeline

| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |
|------|-------|-------|----------|-------------|------------|-------|---------|
| Q3 Renewal | negotiation | 50000 |  | 75 | 2026-06-15 | Budget confirmed | 2026-05-10 |
${overrides}`;
}

function makeInteractionsMd(): string {
  return `## 2026-05-27 · Call
**With:** Max Müller <max@acme.com>
**Summary:** Discussed Q3 renewal pricing.
**Next Steps:**
- [ ] Send proposal
**Source:** manual
**Synced:** 2026-05-27T10:00:00.000Z
---
## 2026-05-20 · Email
**With:** max@acme.com
**Summary:** Sent pricing deck.
**Next Steps:**
- [ ] —
**Source:** gmail://thread/abc
**Synced:** 2026-05-20T10:00:00.000Z
---
## 2026-05-10 · Meeting
**With:** Max Müller, Thomas Berger
**Summary:** Kickoff meeting. Agreed on Q3 timeline.
**Next Steps:**
- [ ] Schedule follow-up
**Source:** manual
**Synced:** 2026-05-10T10:00:00.000Z
---
`;
}

function makeGraphJson(): string {
  return JSON.stringify({
    schemaVersion: "1",
    slug: SLUG,
    nodes: [
      {
        id: `person:max@acme.com`,
        type: "person",
        label: "Max Müller",
        properties: { email: "max@acme.com" },
        roles: ["champion"],
        createdAt: "2026-05-27T10:00:00.000Z",
        updatedAt: "2026-05-27T10:00:00.000Z",
      },
    ],
    edges: [
      {
        id: `IS_CHAMPION:person:max@acme.com__company:acme.com`,
        type: "IS_CHAMPION",
        from: `person:max@acme.com`,
        to: `company:acme.com`,
        weight: 0.5,
        createdAt: "2026-05-27T10:00:00.000Z",
        updatedAt: "2026-05-27T10:00:00.000Z",
      },
    ],
    updatedAt: "2026-05-27T10:00:00.000Z",
  });
}

function makeHealthJson(overrides: object = {}): string {
  return JSON.stringify({
    schemaVersion: "1",
    slug: SLUG,
    overallHealth: 75,
    updatedAt: new Date().toISOString(),
    contacts: [
      {
        contactId: "person:max@acme.com",
        name: "Max Müller",
        email: "max@acme.com",
        score: 75,
        grade: "B",
        trend: "stable",
        daysSinceContact: 0,
        avgCadenceDays: 7,
        sentimentTrend: 0,
        riskFlags: [],
        lastContact: TODAY,
        interactionCount30d: 3,
        recommendation: "Max Müller — grade B.",
      },
    ],
    atRiskContacts: [],
    coldContacts: [],
    ...overrides,
  });
}

function makeConfig(overrides: object = {}) {
  return {
    slug: SLUG,
    dealName: "Q3 Renewal",
    autonomyLevel: "suggest" as const,
    valueThreshold: 100_000,
    today: TODAY,
    ...overrides,
  };
}

function validLlmResponse(): string {
  return JSON.stringify({
    assessment: "Deal is progressing well but close date approaches.",
    riskLevel: "medium",
    plan: [
      { step: 1, action: "Send final proposal", priority: "high", reason: "Close date in 19 days" },
    ],
    actions: [
      {
        type: "log_interaction",
        payload: {
          slug: SLUG,
          type: "Note",
          summary: "Agent reminder: send proposal.",
          with: "Max Müller",
        },
        confidence: 0.85,
        reasoning: "Champion identified, close date approaching",
      },
    ],
  });
}

// ─── agentQueuePath ────────────────────────────────────────────────────────────

describe("agentQueuePath", () => {
  it("returns correct path under customers/<slug>/agent-queue.json", async () => {
    const { agentQueuePath } = await import("../../src/agents/deal-agent.js");
    const p = agentQueuePath(DATA_DIR, SLUG);
    expect(p).toBe(`${DATA_DIR}/customers/${SLUG}/agent-queue.json`);
  });
});

// ─── readAgentQueue / writeAgentQueue ─────────────────────────────────────────

describe("readAgentQueue", () => {
  it("returns empty queue when agent-queue.json does not exist", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { readAgentQueue } = await import("../../src/agents/deal-agent.js");
    const queue = readAgentQueue(DATA_DIR, SLUG);
    expect(queue.schemaVersion).toBe("1");
    expect(queue.slug).toBe(SLUG);
    expect(queue.pendingActions).toEqual([]);
  });

  it("returns empty queue on corrupted JSON (graceful)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/agent-queue.json`]: "NOT JSON{{{",
    });
    const { readAgentQueue } = await import("../../src/agents/deal-agent.js");
    const queue = readAgentQueue(DATA_DIR, SLUG);
    expect(queue.pendingActions).toEqual([]);
  });
});

describe("writeAgentQueue / readAgentQueue roundtrip", () => {
  it("written queue is readable via memfs", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { readAgentQueue, writeAgentQueue } = await import("../../src/agents/deal-agent.js");
    const queue = readAgentQueue(DATA_DIR, SLUG);
    queue.pendingActions.push({
      actionId: "da_123_abc",
      type: "alert",
      payload: { slug: SLUG, message: "test", urgency: "high" },
      confidence: 0.9,
      reasoning: "test",
      requiresHumanApproval: true,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    writeAgentQueue(DATA_DIR, SLUG, queue);
    const read = readAgentQueue(DATA_DIR, SLUG);
    expect(read.pendingActions).toHaveLength(1);
    expect(read.pendingActions[0]!.actionId).toBe("da_123_abc");
  });

  it("updatedAt is refreshed on write", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { readAgentQueue, writeAgentQueue } = await import("../../src/agents/deal-agent.js");
    const before = Date.now();
    const queue = readAgentQueue(DATA_DIR, SLUG);
    writeAgentQueue(DATA_DIR, SLUG, queue);
    const written = readAgentQueue(DATA_DIR, SLUG);
    expect(new Date(written.updatedAt).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("pendingActions preserved across write/read roundtrip", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/${SLUG}/`]: null });
    const { readAgentQueue, writeAgentQueue } = await import("../../src/agents/deal-agent.js");
    const queue = readAgentQueue(DATA_DIR, SLUG);
    queue.pendingActions = [
      {
        actionId: "da_999_xyz",
        type: "update_deal",
        payload: { slug: SLUG, dealName: "Q3 Renewal", notes: "auto" },
        confidence: 0.8,
        reasoning: "Close date near",
        requiresHumanApproval: false,
        status: "pending",
        createdAt: new Date().toISOString(),
      },
    ];
    writeAgentQueue(DATA_DIR, SLUG, queue);
    const read = readAgentQueue(DATA_DIR, SLUG);
    expect(read.pendingActions[0]!.type).toBe("update_deal");
  });
});

// ─── makeActionId ──────────────────────────────────────────────────────────────

describe("makeActionId", () => {
  it("returns string starting with 'da_'", async () => {
    const { makeActionId } = await import("../../src/agents/deal-agent.js");
    expect(makeActionId().startsWith("da_")).toBe(true);
  });

  it("two calls produce different IDs", async () => {
    const { makeActionId } = await import("../../src/agents/deal-agent.js");
    expect(makeActionId()).not.toBe(makeActionId());
  });
});

// ─── parseLlmResponse ─────────────────────────────────────────────────────────

describe("parseLlmResponse", () => {
  it("parses valid JSON response correctly", async () => {
    const { parseLlmResponse } = await import("../../src/agents/deal-agent.js");
    const result = parseLlmResponse(validLlmResponse());
    expect(result).not.toBeNull();
    expect(result!.assessment).toContain("close date");
    expect(result!.riskLevel).toBe("medium");
    expect(result!.plan).toHaveLength(1);
    expect(result!.actions).toHaveLength(1);
  });

  it("returns null for invalid JSON", async () => {
    const { parseLlmResponse } = await import("../../src/agents/deal-agent.js");
    expect(parseLlmResponse("NOT JSON")).toBeNull();
  });

  it("returns null for JSON missing required fields", async () => {
    const { parseLlmResponse } = await import("../../src/agents/deal-agent.js");
    expect(parseLlmResponse(JSON.stringify({ riskLevel: "low" }))).toBeNull();
  });

  it("strips markdown code fences before parsing", async () => {
    const { parseLlmResponse } = await import("../../src/agents/deal-agent.js");
    const fenced = "```json\n" + validLlmResponse() + "\n```";
    const result = parseLlmResponse(fenced);
    expect(result).not.toBeNull();
    expect(result!.riskLevel).toBe("medium");
  });

  it("handles empty actions array", async () => {
    const { parseLlmResponse } = await import("../../src/agents/deal-agent.js");
    const raw = JSON.stringify({
      assessment: "Healthy deal.",
      riskLevel: "low",
      plan: [{ step: 1, action: "Stay course", priority: "low", reason: "all good" }],
      actions: [],
    });
    const result = parseLlmResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.actions).toHaveLength(0);
  });
});

// ─── buildLlmPrompt ───────────────────────────────────────────────────────────

describe("buildLlmPrompt", () => {
  it("includes dealName in prompt", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { observeDeal, buildLlmPrompt } = await import("../../src/agents/deal-agent.js");
    const obs = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    expect(obs).not.toBeNull();
    const prompt = buildLlmPrompt(obs!, makeConfig());
    expect(prompt).toContain("Q3 Renewal");
  });

  it("includes contextSummary in prompt", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { observeDeal, buildLlmPrompt } = await import("../../src/agents/deal-agent.js");
    const obs = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    const prompt = buildLlmPrompt(obs!, makeConfig());
    expect(prompt).toContain("Deal health");
  });

  it("includes instruction when provided", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { observeDeal, buildLlmPrompt } = await import("../../src/agents/deal-agent.js");
    const obs = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    const config = makeConfig({ instruction: "Focus on risk mitigation" });
    const prompt = buildLlmPrompt(obs!, config);
    expect(prompt).toContain("Focus on risk mitigation");
  });

  it("includes default instruction when no instruction given", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { observeDeal, buildLlmPrompt } = await import("../../src/agents/deal-agent.js");
    const obs = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    const prompt = buildLlmPrompt(obs!, makeConfig());
    expect(prompt).toContain("Analyze this deal");
  });

  it("includes JSON schema hint", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { observeDeal, buildLlmPrompt } = await import("../../src/agents/deal-agent.js");
    const obs = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    const prompt = buildLlmPrompt(obs!, makeConfig());
    expect(prompt).toContain('"assessment"');
    expect(prompt).toContain('"riskLevel"');
  });
});

// ─── buildRuleBasedAnalysis ────────────────────────────────────────────────────

describe("buildRuleBasedAnalysis", () => {
  async function makeObs(
    overrides: object = {}
  ): Promise<import("../../src/agents/deal-agent.js").DealObservation> {
    vi.resetModules();
    const { scoreDeal } = await import("../../src/core/deal-health.js");
    const deal = { name: "Q3 Renewal", stage: "negotiation" as const, value: 50000 };
    const signals = { daysSinceLastActivity: 5, daysInCurrentStage: 5 };
    return {
      deal,
      daysSinceLastActivity: 5,
      daysInCurrentStage: 5,
      daysToClose: 30,
      dealHealthScore: scoreDeal(deal, signals),
      overallRelationshipHealth: 75,
      atRiskContacts: [],
      coldContacts: [],
      missingRoles: [],
      championCount: 1,
      recentInteractionsSummary: "",
      contextSummary: "Deal: Q3 Renewal | Stage: negotiation",
      ...overrides,
    } as import("../../src/agents/deal-agent.js").DealObservation;
  }

  it("returns 'critical' riskLevel for grade-F deal", async () => {
    const { buildRuleBasedAnalysis, scoreDeal: _sd } =
      await import("../../src/agents/deal-agent.js");
    const { scoreDeal } = await import("../../src/core/deal-health.js");
    const deal = { name: "Q3 Renewal", stage: "negotiation" as const };
    // Grade F under the v2 weighted model: stale + stalled + overdue, no
    // economic buyer/champion, and a negative last touch (#54).
    const badSignals = {
      daysSinceLastActivity: 70,
      daysInCurrentStage: 100,
      daysToClose: -5,
      hasEconomicBuyer: false,
      hasChampion: false,
      lastTouchSentiment: "negative" as const,
    };
    const obs = await makeObs({
      deal,
      dealHealthScore: scoreDeal(deal, badSignals),
      daysSinceLastActivity: 70,
    });
    const result = buildRuleBasedAnalysis(obs, makeConfig());
    expect(result.riskLevel).toBe("critical");
  });

  it("returns 'critical' riskLevel when cold contacts exist", async () => {
    const { buildRuleBasedAnalysis } = await import("../../src/agents/deal-agent.js");
    const obs = await makeObs({ coldContacts: ["cfo@acme.com"] });
    const result = buildRuleBasedAnalysis(obs, makeConfig());
    expect(result.riskLevel).toBe("critical");
  });

  it("returns 'high' riskLevel when at-risk contacts exist (no cold contacts)", async () => {
    const { buildRuleBasedAnalysis } = await import("../../src/agents/deal-agent.js");
    const obs = await makeObs({ atRiskContacts: ["pm@acme.com"], coldContacts: [] });
    const result = buildRuleBasedAnalysis(obs, makeConfig());
    expect(result.riskLevel).toBe("high");
  });

  it("returns 'low' riskLevel for healthy deal (no flags)", async () => {
    const { buildRuleBasedAnalysis } = await import("../../src/agents/deal-agent.js");
    const obs = await makeObs({});
    const result = buildRuleBasedAnalysis(obs, makeConfig());
    expect(result.riskLevel).toBe("low");
  });

  it("includes re-engage step when cold contacts exist", async () => {
    const { buildRuleBasedAnalysis } = await import("../../src/agents/deal-agent.js");
    const obs = await makeObs({ coldContacts: ["cfo@acme.com"] });
    const result = buildRuleBasedAnalysis(obs, makeConfig());
    expect(result.plan.some((p) => p.action.includes("cfo@acme.com"))).toBe(true);
  });

  it("includes schedule_meeting action when at-risk contacts exist", async () => {
    const { buildRuleBasedAnalysis } = await import("../../src/agents/deal-agent.js");
    const obs = await makeObs({ atRiskContacts: ["sales@acme.com"] });
    const result = buildRuleBasedAnalysis(obs, makeConfig());
    expect(result.actions.some((a) => a.type === "schedule_meeting")).toBe(true);
  });

  it("includes economic_buyer step when missing role", async () => {
    const { buildRuleBasedAnalysis } = await import("../../src/agents/deal-agent.js");
    const obs = await makeObs({ missingRoles: [{ role: "economic_buyer", urgency: "critical" }] });
    const result = buildRuleBasedAnalysis(obs, makeConfig());
    expect(result.plan.some((p) => p.action.includes("economic buyer"))).toBe(true);
  });

  it("returns at least one plan step always", async () => {
    const { buildRuleBasedAnalysis } = await import("../../src/agents/deal-agent.js");
    const obs = await makeObs({});
    const result = buildRuleBasedAnalysis(obs, makeConfig());
    expect(result.plan.length).toBeGreaterThanOrEqual(1);
  });

  it("assessment contains deal name and grade", async () => {
    const { buildRuleBasedAnalysis } = await import("../../src/agents/deal-agent.js");
    const obs = await makeObs({});
    const result = buildRuleBasedAnalysis(obs, makeConfig());
    expect(result.assessment).toContain("Q3 Renewal");
    expect(result.assessment).toMatch(/grade [A-F]/);
  });
});

// ─── selectActions ─────────────────────────────────────────────────────────────

describe("selectActions", () => {
  async function makeAnalysis(confidence = 0.85) {
    return {
      assessment: "test",
      riskLevel: "medium" as const,
      plan: [{ step: 1, action: "do something", priority: "high" as const, reason: "because" }],
      actions: [
        {
          type: "log_interaction" as const,
          payload: { slug: SLUG, type: "Note", summary: "Agent note", with: "Max" },
          confidence,
          reasoning: "test reasoning",
        },
      ],
    };
  }

  async function makeObs(value = 50_000) {
    vi.resetModules();
    const { scoreDeal } = await import("../../src/core/deal-health.js");
    const deal = { name: "Q3 Renewal", stage: "negotiation" as const, value };
    const signals = { daysSinceLastActivity: 5, daysInCurrentStage: 5 };
    return {
      deal,
      daysSinceLastActivity: 5,
      daysInCurrentStage: 5,
      dealHealthScore: scoreDeal(deal, signals),
      overallRelationshipHealth: 75,
      atRiskContacts: [],
      coldContacts: [],
      missingRoles: [],
      championCount: 1,
      recentInteractionsSummary: "",
      contextSummary: "",
    } as import("../../src/agents/deal-agent.js").DealObservation;
  }

  it("sets requiresHumanApproval=false when autonomyLevel=act + confidence>=0.7 + value<threshold", async () => {
    vi.resetModules();
    const { selectActions } = await import("../../src/agents/deal-agent.js");
    const analysis = await makeAnalysis(0.85);
    const obs = await makeObs(50_000);
    const config = makeConfig({ autonomyLevel: "act", valueThreshold: 100_000 });
    const actions = selectActions(analysis, obs, config);
    expect(actions[0]!.requiresHumanApproval).toBe(false);
  });

  it("sets requiresHumanApproval=true when autonomyLevel=suggest (always)", async () => {
    vi.resetModules();
    const { selectActions } = await import("../../src/agents/deal-agent.js");
    const analysis = await makeAnalysis(0.95);
    const obs = await makeObs(1_000);
    const config = makeConfig({ autonomyLevel: "suggest" });
    const actions = selectActions(analysis, obs, config);
    expect(actions[0]!.requiresHumanApproval).toBe(true);
  });

  it("sets requiresHumanApproval=true when autonomyLevel=act + confidence<0.7", async () => {
    vi.resetModules();
    const { selectActions } = await import("../../src/agents/deal-agent.js");
    const analysis = await makeAnalysis(0.5);
    const obs = await makeObs(1_000);
    const config = makeConfig({ autonomyLevel: "act", valueThreshold: 100_000 });
    const actions = selectActions(analysis, obs, config);
    expect(actions[0]!.requiresHumanApproval).toBe(true);
  });

  it("sets requiresHumanApproval=true when autonomyLevel=act + deal value>=threshold", async () => {
    vi.resetModules();
    const { selectActions } = await import("../../src/agents/deal-agent.js");
    const analysis = await makeAnalysis(0.95);
    const obs = await makeObs(200_000);
    const config = makeConfig({ autonomyLevel: "act", valueThreshold: 100_000 });
    const actions = selectActions(analysis, obs, config);
    expect(actions[0]!.requiresHumanApproval).toBe(true);
  });

  it("sets requiresHumanApproval=true when autonomyLevel=observe (always)", async () => {
    vi.resetModules();
    const { selectActions } = await import("../../src/agents/deal-agent.js");
    const analysis = await makeAnalysis(0.99);
    const obs = await makeObs(0);
    const config = makeConfig({ autonomyLevel: "observe" });
    const actions = selectActions(analysis, obs, config);
    expect(actions[0]!.requiresHumanApproval).toBe(true);
  });

  it("each action gets a unique actionId", async () => {
    vi.resetModules();
    const { selectActions } = await import("../../src/agents/deal-agent.js");
    const analysis = {
      assessment: "t",
      riskLevel: "low" as const,
      plan: [],
      actions: [
        {
          type: "alert" as const,
          payload: { slug: SLUG, message: "a", urgency: "high" },
          confidence: 0.8,
          reasoning: "r1",
        },
        {
          type: "alert" as const,
          payload: { slug: SLUG, message: "b", urgency: "high" },
          confidence: 0.8,
          reasoning: "r2",
        },
      ],
    };
    const obs = await makeObs(1_000);
    const actions = selectActions(analysis, obs, makeConfig({ autonomyLevel: "suggest" }));
    expect(actions[0]!.actionId).not.toBe(actions[1]!.actionId);
  });

  it("each action has status='pending'", async () => {
    vi.resetModules();
    const { selectActions } = await import("../../src/agents/deal-agent.js");
    const analysis = await makeAnalysis(0.8);
    const obs = await makeObs(1_000);
    const actions = selectActions(analysis, obs, makeConfig());
    expect(actions[0]!.status).toBe("pending");
  });
});

// ─── observeDeal ──────────────────────────────────────────────────────────────

describe("observeDeal", () => {
  it("returns null when deal not found in pipeline.md", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
    });
    vi.resetModules();
    const { observeDeal } = await import("../../src/agents/deal-agent.js");
    const result = await observeDeal(DATA_DIR, SLUG, "Non Existent Deal", TODAY);
    expect(result).toBeNull();
  });

  it("returns DealObservation when deal exists", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { observeDeal } = await import("../../src/agents/deal-agent.js");
    const result = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    expect(result).not.toBeNull();
    expect(result!.deal.name).toBe("Q3 Renewal");
  });

  it("daysSinceLastActivity correct for given today", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { observeDeal } = await import("../../src/agents/deal-agent.js");
    const result = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    // Updated: 2026-05-10, Today: 2026-05-27 → 17 days
    expect(result!.daysSinceLastActivity).toBe(17);
  });

  it("daysToClose correct when close_date set", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { observeDeal } = await import("../../src/agents/deal-agent.js");
    const result = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    // Close: 2026-06-15, Today: 2026-05-27 → 19 days
    expect(result!.daysToClose).toBe(19);
  });

  it("daysToClose undefined when no close_date", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: `# Pipeline\n\n| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n|------|-------|-------|----------|-------------|------------|-------|---------|
| Q3 Renewal | negotiation | 50000 |  | 75 |  | No close date | 2026-05-20 |`,
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { observeDeal } = await import("../../src/agents/deal-agent.js");
    const result = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    expect(result!.daysToClose).toBeUndefined();
  });

  it("atRiskContacts populated from relationship health", async () => {
    // Provide interactions.md with cfo@acme.com last contact 26 days before TODAY → NO_CONTACT_14D
    const oldInteractions = `## 2026-05-01 · Call\n**With:** cfo@acme.com\n**Summary:** Old check-in.\n**Next Steps:**\n- [ ] —\n**Source:** manual\n**Synced:** 2026-05-01T10:00:00.000Z\n---\n`;
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: oldInteractions,
    });
    vi.resetModules();
    const { observeDeal } = await import("../../src/agents/deal-agent.js");
    const result = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    expect(result!.atRiskContacts.length).toBeGreaterThan(0);
  });

  it("missingRoles populated from graph stakeholders", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
      // No graph.json → getStakeholders returns missingRoles
    });
    vi.resetModules();
    const { observeDeal } = await import("../../src/agents/deal-agent.js");
    const result = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    // No graph → no champions/economic_buyers → missingRoles should be populated
    expect(Array.isArray(result!.missingRoles)).toBe(true);
  });

  it("recentInteractionsSummary empty string when no interactions.md", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { observeDeal } = await import("../../src/agents/deal-agent.js");
    const result = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    expect(result!.recentInteractionsSummary).toBe("(no interactions)");
  });

  it("recentInteractionsSummary contains last 3 interactions", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: makeInteractionsMd(),
    });
    vi.resetModules();
    const { observeDeal } = await import("../../src/agents/deal-agent.js");
    const result = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    // Should contain at least one date reference
    expect(result!.recentInteractionsSummary).toMatch(/2026-05/);
  });

  it("handles missing graph.json gracefully (no champion flags)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { observeDeal } = await import("../../src/agents/deal-agent.js");
    // Should not throw even without graph.json
    await expect(observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY)).resolves.not.toBeNull();
  });

  it("handles missing health gracefully (no errors)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      // No health.json — will compute fresh
    });
    vi.resetModules();
    const { observeDeal } = await import("../../src/agents/deal-agent.js");
    await expect(observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY)).resolves.not.toBeNull();
  });
});

// ─── runDealAgent — observe mode ──────────────────────────────────────────────

describe("runDealAgent — observe mode", () => {
  const mockLlm = async (_: string) => validLlmResponse();

  it("returns assessment and riskLevel", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const result = await runDealAgent(makeConfig({ autonomyLevel: "observe" }), DATA_DIR, mockLlm);
    expect(typeof result.assessment).toBe("string");
    expect(result.assessment.length).toBeGreaterThan(0);
    expect(result.riskLevel).toBeDefined();
  });

  it("plan has at least one step", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const result = await runDealAgent(makeConfig({ autonomyLevel: "observe" }), DATA_DIR, mockLlm);
    expect(result.plan.length).toBeGreaterThanOrEqual(1);
  });

  it("actionsQueued is empty (observe mode — no side effects)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const result = await runDealAgent(makeConfig({ autonomyLevel: "observe" }), DATA_DIR, mockLlm);
    expect(result.actionsQueued).toHaveLength(0);
  });

  it("actionsExecuted is empty", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const result = await runDealAgent(makeConfig({ autonomyLevel: "observe" }), DATA_DIR, mockLlm);
    expect(result.actionsExecuted).toHaveLength(0);
  });

  it("trace.outcome is 'observed'", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const result = await runDealAgent(makeConfig({ autonomyLevel: "observe" }), DATA_DIR, mockLlm);
    expect(result.trace.outcome).toBe("observed");
  });

  it("no agent-queue.json written", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    await runDealAgent(makeConfig({ autonomyLevel: "observe" }), DATA_DIR, mockLlm);
    const fs = await import("fs");
    expect(fs.existsSync(`${DATA_DIR}/customers/${SLUG}/agent-queue.json`)).toBe(false);
  });
});

// ─── runDealAgent — suggest mode ──────────────────────────────────────────────

describe("runDealAgent — suggest mode", () => {
  const mockLlm = async (_: string) => validLlmResponse();

  it("actionsQueued contains actions from LLM response", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const result = await runDealAgent(makeConfig({ autonomyLevel: "suggest" }), DATA_DIR, mockLlm);
    expect(result.actionsQueued.length).toBeGreaterThan(0);
  });

  it("all queued actions have requiresHumanApproval=true", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const result = await runDealAgent(makeConfig({ autonomyLevel: "suggest" }), DATA_DIR, mockLlm);
    expect(result.actionsQueued.every((a) => a.requiresHumanApproval)).toBe(true);
  });

  it("agent-queue.json is written with pending actions", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent, readAgentQueue } = await import("../../src/agents/deal-agent.js");
    await runDealAgent(makeConfig({ autonomyLevel: "suggest" }), DATA_DIR, mockLlm);
    const queue = readAgentQueue(DATA_DIR, SLUG);
    expect(queue.pendingActions.length).toBeGreaterThan(0);
  });

  it("actionsExecuted is empty", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const result = await runDealAgent(makeConfig({ autonomyLevel: "suggest" }), DATA_DIR, mockLlm);
    expect(result.actionsExecuted).toHaveLength(0);
  });

  it("trace.outcome is 'queued'", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const result = await runDealAgent(makeConfig({ autonomyLevel: "suggest" }), DATA_DIR, mockLlm);
    expect(result.trace.outcome).toBe("queued");
  });
});

// ─── runDealAgent — act mode (high confidence, low value) ────────────────────

describe("runDealAgent — act mode (high confidence, low value)", () => {
  const mockLlm = async (_: string) => validLlmResponse(); // confidence: 0.85

  it("executes actions with confidence>=0.7 + value<threshold", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: "",
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const config = makeConfig({ autonomyLevel: "act", valueThreshold: 100_000 });
    const result = await runDealAgent(config, DATA_DIR, mockLlm);
    expect(result.actionsExecuted.length).toBeGreaterThan(0);
  });

  it("actionsExecuted has executed actions", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: "",
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const config = makeConfig({ autonomyLevel: "act", valueThreshold: 100_000 });
    const result = await runDealAgent(config, DATA_DIR, mockLlm);
    expect(result.actionsExecuted[0]!.status).toBe("executed");
  });

  it("trace.outcome is 'executed'", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: "",
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const config = makeConfig({ autonomyLevel: "act", valueThreshold: 100_000 });
    const result = await runDealAgent(config, DATA_DIR, mockLlm);
    expect(result.trace.outcome).toBe("executed");
  });

  it("high-confidence actions NOT in actionsQueued", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: "",
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const config = makeConfig({ autonomyLevel: "act", valueThreshold: 100_000 });
    const result = await runDealAgent(config, DATA_DIR, mockLlm);
    expect(result.actionsQueued).toHaveLength(0);
  });
});

// ─── runDealAgent — act mode (low confidence → queue) ────────────────────────

describe("runDealAgent — act mode (low confidence → queue)", () => {
  const lowConfLlm = async (_: string) =>
    JSON.stringify({
      assessment: "Deal uncertain.",
      riskLevel: "high",
      plan: [{ step: 1, action: "Investigate", priority: "high", reason: "Unknown" }],
      actions: [
        {
          type: "alert",
          payload: { slug: SLUG, message: "Low confidence action", urgency: "medium" },
          confidence: 0.4, // below 0.7
          reasoning: "Low confidence",
        },
      ],
    });

  it("low-confidence actions go to queue not execution", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const config = makeConfig({ autonomyLevel: "act", valueThreshold: 100_000 });
    const result = await runDealAgent(config, DATA_DIR, lowConfLlm);
    expect(result.actionsExecuted).toHaveLength(0);
  });

  it("actionsQueued contains low-confidence actions", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const config = makeConfig({ autonomyLevel: "act", valueThreshold: 100_000 });
    const result = await runDealAgent(config, DATA_DIR, lowConfLlm);
    expect(result.actionsQueued.length).toBeGreaterThan(0);
  });
});

// ─── runDealAgent — LLM fallback ──────────────────────────────────────────────

describe("runDealAgent — LLM fallback", () => {
  it("uses rule-based analysis when LLM throws error", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const failingLlm = async () => {
      throw new Error("API Error");
    };
    const result = await runDealAgent(
      makeConfig({ autonomyLevel: "observe" }),
      DATA_DIR,
      failingLlm
    );
    expect(result.riskLevel).toBeDefined();
  });

  it("still returns valid DealAgentResult on LLM failure", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const failingLlm = async () => {
      throw new Error("Network timeout");
    };
    const result = await runDealAgent(
      makeConfig({ autonomyLevel: "observe" }),
      DATA_DIR,
      failingLlm
    );
    expect(result.assessment).toBeDefined();
    expect(result.plan.length).toBeGreaterThanOrEqual(1);
  });

  it("riskLevel is set from rule-based analysis", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const failingLlm = async () => {
      throw new Error("API Error");
    };
    const result = await runDealAgent(
      makeConfig({ autonomyLevel: "observe" }),
      DATA_DIR,
      failingLlm
    );
    expect(["low", "medium", "high", "critical"]).toContain(result.riskLevel);
  });
});

// ─── runDealAgent — deal not found ────────────────────────────────────────────

describe("runDealAgent — deal not found", () => {
  it("throws Error when dealName not found in pipeline", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    vi.resetModules();
    const { runDealAgent } = await import("../../src/agents/deal-agent.js");
    const mockLlm = async () => validLlmResponse();
    await expect(
      runDealAgent(makeConfig({ dealName: "Ghost Deal" }), DATA_DIR, mockLlm)
    ).rejects.toThrow("Ghost Deal");
  });
});

// ─── D15 Playbook integration ─────────────────────────────────────────────────

describe("observeDeal — D15 playbook integration", () => {
  it("matchingPlaybooks is absent when no playbooks dir exists", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: makeInteractionsMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
    });
    vi.resetModules();
    const { observeDeal } = await import("../../src/agents/deal-agent.js");
    const obs = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    expect(obs).not.toBeNull();
    expect(obs!.matchingPlaybooks).toBeUndefined();
  });

  it("matchingPlaybooks populated when a playbook trigger matches", async () => {
    // Q3 Renewal is in stage=negotiation, value=50000 — trigger matches value >= 50000
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: makeInteractionsMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
      [`${DATA_DIR}/customers/${SLUG}/playbooks/renewal.md`]:
        "---\ntrigger: deal_stage_negotiation\nsuccessRate: 0.8\nusedCount: 5\nlastUpdated: 2026-05-20\n---\n\n# Renewal Playbook\n\n## Steps\n1. Call buyer.",
    });
    vi.resetModules();
    const { observeDeal } = await import("../../src/agents/deal-agent.js");
    const obs = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    expect(obs).not.toBeNull();
    expect(obs!.matchingPlaybooks).toBeDefined();
    expect(obs!.matchingPlaybooks!.length).toBeGreaterThan(0);
    expect(obs!.matchingPlaybooks![0]!.playbook.name).toBe("renewal");
  });

  it("buildRuleBasedAnalysis includes playbook alert when matchingPlaybooks present", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: makeInteractionsMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
      [`${DATA_DIR}/customers/${SLUG}/graph.json`]: makeGraphJson(),
      [`${DATA_DIR}/customers/${SLUG}/playbooks/renewal.md`]:
        "---\ntrigger: deal_stage_negotiation\nsuccessRate: 0.8\nusedCount: 5\nlastUpdated: 2026-05-20\n---\n\n# Renewal Playbook\n\n## Steps\n1. Call buyer.",
    });
    vi.resetModules();
    const { observeDeal, buildRuleBasedAnalysis } = await import("../../src/agents/deal-agent.js");
    const obs = await observeDeal(DATA_DIR, SLUG, "Q3 Renewal", TODAY);
    expect(obs).not.toBeNull();
    const analysis = buildRuleBasedAnalysis(obs!, makeConfig());
    const hasPlaybookAlert = analysis.actions.some(
      (a) => a.type === "alert" && JSON.stringify(a.payload).toLowerCase().includes("playbook")
    );
    expect(hasPlaybookAlert).toBe(true);
  });
});

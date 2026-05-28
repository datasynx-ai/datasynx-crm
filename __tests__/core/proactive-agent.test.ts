import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";
const TODAY = "2026-05-28";

function makeInteractionMd(date: string): string {
  return `## ${date} · Call\n**With:** max@acme.com\n**Summary:** Check-in.\n**Next Steps:**\n- [ ] —\n**Source:** agent://1\n**Synced:** ${date}T10:00:00.000Z\n---\n`;
}

function makePipelineMd(closeDate: string, stage = "proposal"): string {
  return `| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n|------|-------|-------|----------|-------------|------------|-------|------|\n| Enterprise License | ${stage} | 150000 | EUR | 60 | ${closeDate} |  | 2026-05-20 |\n`;
}

// ─── enqueueTask ──────────────────────────────────────────────────────────────

describe("enqueueTask", () => {
  it("writes a task to the queue file", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/`]: null });
    const { enqueueTask } = await import("../../src/core/proactive-agent.js");
    const task = await enqueueTask(DATA_DIR, {
      type: "daily_briefing",
      priority: "normal",
      payload: {},
      scheduledFor: TODAY,
      channel: "mcp_tool_response",
    });
    expect(task.id).toBeDefined();
    expect(task.status).toBe("pending");
  });

  it("returns task with correct type", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/`]: null });
    const { enqueueTask } = await import("../../src/core/proactive-agent.js");
    const task = await enqueueTask(DATA_DIR, {
      type: "relationship_decay_alert",
      slug: SLUG,
      priority: "high",
      payload: { contact: "max@acme.com" },
      scheduledFor: TODAY,
      channel: "mcp_tool_response",
    });
    expect(task.type).toBe("relationship_decay_alert");
    expect(task.slug).toBe(SLUG);
  });

  it("multiple tasks accumulate in the queue", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/`]: null });
    const { enqueueTask, readQueue } = await import("../../src/core/proactive-agent.js");
    await enqueueTask(DATA_DIR, { type: "daily_briefing", priority: "normal", payload: {}, scheduledFor: TODAY, channel: "mcp_tool_response" });
    await enqueueTask(DATA_DIR, { type: "deal_risk_alert", slug: SLUG, priority: "urgent", payload: {}, scheduledFor: TODAY, channel: "mcp_tool_response" });
    const queue = readQueue(DATA_DIR);
    expect(queue.length).toBe(2);
  });
});

// ─── buildDailyBriefing ───────────────────────────────────────────────────────

describe("buildDailyBriefing", () => {
  it("returns date and required fields", async () => {
    vol.fromJSON({});
    const { buildDailyBriefing } = await import("../../src/core/proactive-agent.js");
    const briefing = await buildDailyBriefing(DATA_DIR, TODAY);
    expect(briefing.date).toBe(TODAY);
    expect(Array.isArray(briefing.urgent)).toBe(true);
    expect(Array.isArray(briefing.opportunities)).toBe(true);
    expect(typeof briefing.forecast).toBe("string");
    expect(typeof briefing.topAction).toBe("string");
  });

  it("detects relationship decay for cold contacts", async () => {
    // Very old interaction → NO_CONTACT_30D
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: makeInteractionMd("2026-03-01"),
    });
    const { buildDailyBriefing } = await import("../../src/core/proactive-agent.js");
    const briefing = await buildDailyBriefing(DATA_DIR, TODAY);
    const hasDecayAlert = briefing.urgent.some((u) =>
      u.toLowerCase().includes("max") || u.toLowerCase().includes(SLUG)
    );
    expect(hasDecayAlert).toBe(true);
  });

  it("detects deal risk when close date is imminent", async () => {
    const closeDate = "2026-05-31"; // 3 days away
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(closeDate),
    });
    const { buildDailyBriefing } = await import("../../src/core/proactive-agent.js");
    const briefing = await buildDailyBriefing(DATA_DIR, TODAY);
    const hasUrgent = briefing.urgent.some((u) => u.includes("closes in"));
    expect(hasUrgent).toBe(true);
  });

  it("flags overdue close date as urgent", async () => {
    const closeDate = "2026-05-01"; // 27 days ago
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(closeDate),
    });
    const { buildDailyBriefing } = await import("../../src/core/proactive-agent.js");
    const briefing = await buildDailyBriefing(DATA_DIR, TODAY);
    const hasOverdue = briefing.urgent.some((u) => u.includes("overdue"));
    expect(hasOverdue).toBe(true);
  });

  it("populates opportunities for high-health customers with active deals", async () => {
    // High health = no recent cold contacts, interactions recently
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: makeInteractionMd("2026-05-27"),
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd("2026-12-31"),
    });
    const { buildDailyBriefing } = await import("../../src/core/proactive-agent.js");
    const briefing = await buildDailyBriefing(DATA_DIR, TODAY);
    // overallHealth will be 100 (recent contact), pipeline has 1 active deal
    expect(briefing.opportunities.length).toBeGreaterThan(0);
  });

  it("returns non-empty topAction", async () => {
    vol.fromJSON({});
    const { buildDailyBriefing } = await import("../../src/core/proactive-agent.js");
    const briefing = await buildDailyBriefing(DATA_DIR, TODAY);
    expect(briefing.topAction.length).toBeGreaterThan(0);
  });

  it("includes forecast string when no deals", async () => {
    vol.fromJSON({});
    const { buildDailyBriefing } = await import("../../src/core/proactive-agent.js");
    const briefing = await buildDailyBriefing(DATA_DIR, TODAY);
    expect(typeof briefing.forecast).toBe("string");
  });
});

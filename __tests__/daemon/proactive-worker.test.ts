import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ProactiveCheckResult } from "../../src/daemon/proactive-worker.js";
import type { HealthSnapshot } from "../../src/core/relationship-health.js";
import type { AgentTask } from "../../src/core/proactive-agent.js";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockReadHealth = vi.hoisted(() => vi.fn<[string, string], HealthSnapshot | null>());
const mockComputeCustomerHealth = vi.hoisted(() => vi.fn<[string, string, string], HealthSnapshot>());
const mockReadPipeline = vi.hoisted(() => vi.fn<[string, string], Promise<unknown[]>>());
const mockBuildDailyBriefing = vi.hoisted(() => vi.fn<[string, string], Promise<unknown>>());
const mockEnqueueTask = vi.hoisted(() => vi.fn<[string, unknown], Promise<AgentTask>>());

vi.mock("../../src/core/relationship-health.js", () => ({
  readHealth: mockReadHealth,
  computeCustomerHealth: mockComputeCustomerHealth,
}));

vi.mock("../../src/fs/pipeline-writer.js", () => ({
  readPipeline: mockReadPipeline,
}));

vi.mock("../../src/core/proactive-agent.js", () => ({
  buildDailyBriefing: mockBuildDailyBriefing,
  enqueueTask: mockEnqueueTask,
}));

// memfs for fs operations
import { vol } from "memfs";
vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DATA_DIR = "/data";
const TODAY = "2026-05-28";

function makeHealthSnapshot(slug: string, overrides: Partial<HealthSnapshot["contacts"][number]> = {}): HealthSnapshot {
  return {
    schemaVersion: "1",
    slug,
    overallHealth: 80,
    updatedAt: new Date().toISOString(),
    contacts: [
      {
        contactId: "c1",
        name: "Alice",
        email: "alice@example.com",
        score: 80,
        grade: "B",
        trend: "stable",
        daysSinceContact: 10,
        avgCadenceDays: 14,
        sentimentTrend: 0,
        riskFlags: [],
        lastContact: "2026-05-18",
        interactionCount30d: 2,
        recommendation: "Keep in touch",
        updatedAt: new Date().toISOString(),
        ...overrides,
      },
    ],
  };
}

function makeDecayedHealth(slug: string): HealthSnapshot {
  return makeHealthSnapshot(slug, {
    grade: "F",
    riskFlags: ["NO_CONTACT_30D"],
    daysSinceContact: 35,
  });
}

function makeDeal(overrides: Record<string, unknown> = {}) {
  return {
    name: "Big Deal",
    stage: "proposal",
    value: 50000,
    close_date: "",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runDailyProactiveChecks", () => {
  let runDailyProactiveChecks: (dataDir: string, today?: string) => Promise<ProactiveCheckResult>;

  beforeEach(async () => {
    vol.reset();
    vi.clearAllMocks();
    vi.resetModules();

    mockBuildDailyBriefing.mockResolvedValue({ date: TODAY, urgent: [], opportunities: [], forecast: "", topAction: "" });
    mockEnqueueTask.mockResolvedValue({ id: "task_1", status: "pending" } as AgentTask);
    mockReadPipeline.mockResolvedValue([]);

    const mod = await import("../../src/daemon/proactive-worker.js");
    runDailyProactiveChecks = mod.runDailyProactiveChecks;
  });

  it("returns empty result when customers dir does not exist", async () => {
    vol.fromJSON({});
    const result = await runDailyProactiveChecks(DATA_DIR, TODAY);
    expect(result.customersChecked).toBe(0);
    expect(result.tasksEnqueued).toBe(1); // daily_briefing always enqueued
    expect(result.errors).toHaveLength(0);
  });

  it("returns result with today's date", async () => {
    vol.fromJSON({});
    const result = await runDailyProactiveChecks(DATA_DIR, TODAY);
    expect(result.today).toBe(TODAY);
  });

  it("uses cached health snapshot when available", async () => {
    const snapshot = makeHealthSnapshot("acme");
    mockReadHealth.mockReturnValue(snapshot);
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    await runDailyProactiveChecks(DATA_DIR, TODAY);

    expect(mockReadHealth).toHaveBeenCalledWith(DATA_DIR, "acme");
    expect(mockComputeCustomerHealth).not.toHaveBeenCalled();
  });

  it("computes health when no cached snapshot exists", async () => {
    mockReadHealth.mockReturnValue(null);
    const snapshot = makeHealthSnapshot("acme");
    mockComputeCustomerHealth.mockReturnValue(snapshot);
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    await runDailyProactiveChecks(DATA_DIR, TODAY);

    expect(mockComputeCustomerHealth).toHaveBeenCalledWith(DATA_DIR, "acme", TODAY);
  });

  it("enqueues relationship_decay_alert for grade-F contact", async () => {
    mockReadHealth.mockReturnValue(makeDecayedHealth("acme"));
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    const result = await runDailyProactiveChecks(DATA_DIR, TODAY);

    const decayCall = mockEnqueueTask.mock.calls.find(
      (c) => (c[1] as { type: string }).type === "relationship_decay_alert"
    );
    expect(decayCall).toBeDefined();
    expect((decayCall![1] as { priority: string }).priority).toBe("urgent");
    expect(result.tasksEnqueued).toBeGreaterThanOrEqual(2); // decay + briefing
  });

  it("enqueues relationship_decay_alert for NO_CONTACT_30D (non-F grade)", async () => {
    mockReadHealth.mockReturnValue(
      makeHealthSnapshot("acme", { grade: "C", riskFlags: ["NO_CONTACT_30D"], daysSinceContact: 31 })
    );
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    await runDailyProactiveChecks(DATA_DIR, TODAY);

    const decayCall = mockEnqueueTask.mock.calls.find(
      (c) => (c[1] as { type: string }).type === "relationship_decay_alert"
    );
    expect(decayCall).toBeDefined();
    expect((decayCall![1] as { priority: string }).priority).toBe("high");
  });

  it("does not enqueue decay alert for healthy contact", async () => {
    mockReadHealth.mockReturnValue(makeHealthSnapshot("acme")); // grade B, no risk flags
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    await runDailyProactiveChecks(DATA_DIR, TODAY);

    const decayCall = mockEnqueueTask.mock.calls.find(
      (c) => (c[1] as { type: string }).type === "relationship_decay_alert"
    );
    expect(decayCall).toBeUndefined();
  });

  it("enqueues deal_risk_alert for deal closing within 7 days", async () => {
    mockReadHealth.mockReturnValue(makeHealthSnapshot("acme"));
    const closeDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    mockReadPipeline.mockResolvedValue([makeDeal({ close_date: closeDate, stage: "proposal" })]);
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    const result = await runDailyProactiveChecks(DATA_DIR, TODAY);

    const riskCall = mockEnqueueTask.mock.calls.find(
      (c) => (c[1] as { type: string }).type === "deal_risk_alert"
    );
    expect(riskCall).toBeDefined();
    expect((riskCall![1] as { priority: string }).priority).toBe("high");
    expect(result.tasksEnqueued).toBeGreaterThanOrEqual(2);
  });

  it("enqueues urgent deal_risk_alert for overdue deal", async () => {
    mockReadHealth.mockReturnValue(makeHealthSnapshot("acme"));
    const closeDate = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    mockReadPipeline.mockResolvedValue([makeDeal({ close_date: closeDate, stage: "proposal" })]);
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    await runDailyProactiveChecks(DATA_DIR, TODAY);

    const riskCall = mockEnqueueTask.mock.calls.find(
      (c) => (c[1] as { type: string }).type === "deal_risk_alert"
    );
    expect(riskCall).toBeDefined();
    expect((riskCall![1] as { priority: string }).priority).toBe("urgent");
    const payload = (riskCall![1] as { payload: { overdue: boolean } }).payload;
    expect(payload.overdue).toBe(true);
  });

  it("skips won/lost deals", async () => {
    mockReadHealth.mockReturnValue(makeHealthSnapshot("acme"));
    const closeDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    mockReadPipeline.mockResolvedValue([
      makeDeal({ close_date: closeDate, stage: "won" }),
      makeDeal({ close_date: closeDate, stage: "lost" }),
    ]);
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    await runDailyProactiveChecks(DATA_DIR, TODAY);

    const riskCall = mockEnqueueTask.mock.calls.find(
      (c) => (c[1] as { type: string }).type === "deal_risk_alert"
    );
    expect(riskCall).toBeUndefined();
  });

  it("skips deals with no close_date", async () => {
    mockReadHealth.mockReturnValue(makeHealthSnapshot("acme"));
    mockReadPipeline.mockResolvedValue([makeDeal({ stage: "proposal", close_date: "   " })]);
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    await runDailyProactiveChecks(DATA_DIR, TODAY);

    const riskCall = mockEnqueueTask.mock.calls.find(
      (c) => (c[1] as { type: string }).type === "deal_risk_alert"
    );
    expect(riskCall).toBeUndefined();
  });

  it("skips deals closing more than 7 days out", async () => {
    mockReadHealth.mockReturnValue(makeHealthSnapshot("acme"));
    const closeDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    mockReadPipeline.mockResolvedValue([makeDeal({ close_date: closeDate, stage: "proposal" })]);
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    await runDailyProactiveChecks(DATA_DIR, TODAY);

    const riskCall = mockEnqueueTask.mock.calls.find(
      (c) => (c[1] as { type: string }).type === "deal_risk_alert"
    );
    expect(riskCall).toBeUndefined();
  });

  it("always enqueues daily_briefing", async () => {
    vol.fromJSON({});

    await runDailyProactiveChecks(DATA_DIR, TODAY);

    const briefingCall = mockEnqueueTask.mock.calls.find(
      (c) => (c[1] as { type: string }).type === "daily_briefing"
    );
    expect(briefingCall).toBeDefined();
  });

  it("records briefing build error without throwing", async () => {
    vol.fromJSON({});
    mockBuildDailyBriefing.mockRejectedValue(new Error("LLM timeout"));

    const result = await runDailyProactiveChecks(DATA_DIR, TODAY);

    expect(result.errors).toContain("daily_briefing: LLM timeout");
  });

  it("records per-customer error without aborting other customers", async () => {
    mockReadHealth.mockReturnValue(null);
    mockComputeCustomerHealth.mockImplementationOnce(() => { throw new Error("corrupt health"); });
    const snapshot = makeHealthSnapshot("beta");
    mockComputeCustomerHealth.mockReturnValueOnce(snapshot);
    vol.fromJSON({
      [`${DATA_DIR}/customers/alpha/.keep`]: "",
      [`${DATA_DIR}/customers/beta/.keep`]: "",
    });

    const result = await runDailyProactiveChecks(DATA_DIR, TODAY);

    expect(result.errors.some((e) => e.includes("corrupt health"))).toBe(true);
    expect(result.customersChecked).toBe(1); // beta succeeded
  });

  it("respects MAX_CUSTOMERS_PER_CYCLE limit (50)", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 60; i++) {
      files[`${DATA_DIR}/customers/customer-${i}/.keep`] = "";
    }
    vol.fromJSON(files);
    mockReadHealth.mockReturnValue(makeHealthSnapshot("x"));

    const result = await runDailyProactiveChecks(DATA_DIR, TODAY);
    expect(result.customersChecked).toBeLessThanOrEqual(50);
  });

  it("includes contactId in decay alert payload", async () => {
    mockReadHealth.mockReturnValue(makeDecayedHealth("acme"));
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    await runDailyProactiveChecks(DATA_DIR, TODAY);

    const decayCall = mockEnqueueTask.mock.calls.find(
      (c) => (c[1] as { type: string }).type === "relationship_decay_alert"
    );
    const payload = (decayCall![1] as { payload: { contactId: string } }).payload;
    expect(payload.contactId).toBe("c1");
  });

  it("includes daysToClose in deal risk payload", async () => {
    mockReadHealth.mockReturnValue(makeHealthSnapshot("acme"));
    const closeDate = new Date(new Date(`${TODAY}T00:00:00Z`).getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
    mockReadPipeline.mockResolvedValue([makeDeal({ close_date: closeDate, stage: "negotiation" })]);
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });

    await runDailyProactiveChecks(DATA_DIR, TODAY);

    const riskCall = mockEnqueueTask.mock.calls.find(
      (c) => (c[1] as { type: string }).type === "deal_risk_alert"
    );
    const payload = (riskCall![1] as { payload: { daysToClose: number } }).payload;
    expect(payload.daysToClose).toBeLessThanOrEqual(4);
  });

  it("uses mcp_tool_response channel when no env vars set", async () => {
    const savedTelegram = process.env["TELEGRAM_BOT_TOKEN"];
    const savedSlack = process.env["SLACK_WEBHOOK_URL"];
    delete process.env["TELEGRAM_BOT_TOKEN"];
    delete process.env["SLACK_WEBHOOK_URL"];

    vol.fromJSON({});
    await runDailyProactiveChecks(DATA_DIR, TODAY);

    const briefingCall = mockEnqueueTask.mock.calls.find(
      (c) => (c[1] as { type: string }).type === "daily_briefing"
    );
    expect((briefingCall![1] as { channel: string }).channel).toBe("mcp_tool_response");

    if (savedTelegram) process.env["TELEGRAM_BOT_TOKEN"] = savedTelegram;
    if (savedSlack) process.env["SLACK_WEBHOOK_URL"] = savedSlack;
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";

const mockBuildFn = async () => ({
  deals: [],
  externalSignals: [] as [],
  iterations: 100,
  horizon: "quarter" as const,
  today: "2026-05-27",
});

describe("get_goal_status tool", () => {
  it("returns empty list when no goals", async () => {
    vol.fromJSON({});
    const { handleGetGoalStatus } = await import("../../../src/mcp/tools/get-goal-status.js");
    const res = await handleGetGoalStatus({}, DATA_DIR);
    const data = JSON.parse(res.content[0]!.text);
    expect(data.goals).toEqual([]);
    expect(data.activeCount).toBe(0);
  });

  it("returns active goals with daysRemaining", async () => {
    vol.fromJSON({});
    const { handlePursueGoal } = await import("../../../src/mcp/tools/pursue-goal.js");
    await handlePursueGoal({ goal: "Close €100k", deadline: "2026-12-31" }, DATA_DIR, {
      buildInputFn: mockBuildFn,
    });
    const { handleGetGoalStatus } = await import("../../../src/mcp/tools/get-goal-status.js");
    const res = await handleGetGoalStatus({}, DATA_DIR);
    const data = JSON.parse(res.content[0]!.text);
    expect(data.goals).toHaveLength(1);
    expect(data.goals[0].daysRemaining).toBeGreaterThan(0);
    expect(data.activeCount).toBe(1);
  });

  it("excludes cancelled goals from default listing", async () => {
    vol.fromJSON({});
    const { handlePursueGoal } = await import("../../../src/mcp/tools/pursue-goal.js");
    const res1 = await handlePursueGoal({ goal: "Close €100k", deadline: "2026-09-30" }, DATA_DIR, {
      buildInputFn: mockBuildFn,
    });
    const goalId = JSON.parse(res1.content[0]!.text).goalId as string;
    const { cancelGoal } = await import("../../../src/core/goal-engine.js");
    cancelGoal(DATA_DIR, goalId);
    const { handleGetGoalStatus } = await import("../../../src/mcp/tools/get-goal-status.js");
    const res = await handleGetGoalStatus({}, DATA_DIR);
    const data = JSON.parse(res.content[0]!.text);
    expect(data.goals).toHaveLength(0);
  });

  it("returns specific goal when goalId provided", async () => {
    vol.fromJSON({});
    const { handlePursueGoal } = await import("../../../src/mcp/tools/pursue-goal.js");
    const r = await handlePursueGoal({ goal: "Close €200k", deadline: "2026-09-30" }, DATA_DIR, {
      buildInputFn: mockBuildFn,
    });
    const goalId = JSON.parse(r.content[0]!.text).goalId as string;
    const { handleGetGoalStatus } = await import("../../../src/mcp/tools/get-goal-status.js");
    const res = await handleGetGoalStatus({ goalId }, DATA_DIR);
    const data = JSON.parse(res.content[0]!.text);
    expect(data.goals[0].id).toBe(goalId);
  });

  it("returns error response for unknown goalId", async () => {
    vol.fromJSON({});
    const { handleGetGoalStatus } = await import("../../../src/mcp/tools/get-goal-status.js");
    const res = await handleGetGoalStatus({ goalId: "goal_unknown_000000" }, DATA_DIR);
    const data = JSON.parse(res.content[0]!.text);
    expect(data.success).toBe(false);
  });

  it("registers tool with correct name", async () => {
    const { registerGetGoalStatus } = await import("../../../src/mcp/tools/get-goal-status.js");
    const calls: string[] = [];
    const fakeServer = { registerTool: (name: string) => calls.push(name) };
    registerGetGoalStatus(fakeServer as never);
    expect(calls).toContain("get_goal_status");
  });

  it("registered handler invokes handleGetGoalStatus with optional goalId", async () => {
    vol.fromJSON({});
    const { registerGetGoalStatus } = await import("../../../src/mcp/tools/get-goal-status.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerGetGoalStatus(fakeServer as never);
    const result = await capturedHandler!({ goalId: "goal_unknown_999" });
    const parsed = JSON.parse(result.content[0]!.text) as { success: boolean };
    expect(typeof parsed.success).toBe("boolean");
  });

  it("returns error response when readGoals throws", async () => {
    vi.doMock("../../../src/core/goal-engine.js", () => ({
      readGoals: vi.fn().mockImplementation(() => {
        throw new Error("goals read error");
      }),
      getActiveGoals: vi.fn().mockReturnValue([]),
    }));
    vol.fromJSON({});
    const { handleGetGoalStatus } = await import("../../../src/mcp/tools/get-goal-status.js");
    const res = await handleGetGoalStatus({ goalId: "goal_test_123" }, DATA_DIR);
    const data = JSON.parse(res.content[0]!.text) as { success: boolean; error: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain("goals read error");
  });
});

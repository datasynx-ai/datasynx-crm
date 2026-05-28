import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/core/goal-engine.js", () => ({
  pursueGoal: vi.fn(),
  getActiveGoals: vi.fn().mockReturnValue([]),
  updateGoalProgress: vi.fn().mockResolvedValue(null),
  cancelGoal: vi.fn().mockResolvedValue(false),
}));

import {
  pursueGoal,
  getActiveGoals,
  updateGoalProgress,
  cancelGoal,
} from "../../src/core/goal-engine.js";

const mockPursue = vi.mocked(pursueGoal);
const mockGetActive = vi.mocked(getActiveGoals);
const mockUpdateProgress = vi.mocked(updateGoalProgress);
const mockCancel = vi.mocked(cancelGoal);

const sampleGoal = {
  id: "goal-2026-001",
  description: "Close 3 enterprise deals",
  target: 300000,
  deadline: "2026-12-31",
  progress: 0,
  status: "active" as const,
  createdAt: "2026-05-28T00:00:00Z",
  updatedAt: "2026-05-28T00:00:00Z",
  decomposition: {
    currentPipeline: 150000,
    gap: 150000,
    subGoals: [
      { priority: 1, action: "Close Acme Corp deal", nextStep: "Send contract" },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetActive.mockReturnValue([]);
  mockUpdateProgress.mockResolvedValue(null);
  mockCancel.mockResolvedValue(false);
});

describe("runGoalSet", () => {
  it("calls pursueGoal and prints goal details", async () => {
    mockPursue.mockResolvedValue(sampleGoal);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGoalSet } = await import("../../src/commands/goal.js");
    await runGoalSet("Close 3 enterprise deals", { deadline: "2026-12-31" });
    expect(mockPursue).toHaveBeenCalledWith(expect.any(String), {
      description: "Close 3 enterprise deals",
      deadline: "2026-12-31",
    });
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("goal-2026-001");
    expect(output).toContain("300");
    logSpy.mockRestore();
  });

  it("prints action plan when subGoals present", async () => {
    mockPursue.mockResolvedValue(sampleGoal);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGoalSet } = await import("../../src/commands/goal.js");
    await runGoalSet("Close deals", { deadline: "2026-12-31" });
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Close Acme Corp deal");
    logSpy.mockRestore();
  });
});

describe("runGoalStatus", () => {
  it("shows 'No active goals' when empty", async () => {
    mockGetActive.mockReturnValue([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGoalStatus } = await import("../../src/commands/goal.js");
    await runGoalStatus();
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/no active goals/i);
    logSpy.mockRestore();
  });

  it("displays active goals with progress bar", async () => {
    mockGetActive.mockReturnValue([sampleGoal]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGoalStatus } = await import("../../src/commands/goal.js");
    await runGoalStatus();
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("goal-2026-001");
    expect(output).toContain("300");
    logSpy.mockRestore();
  });
});

describe("runGoalUpdate", () => {
  it("calls updateGoalProgress with correct args", async () => {
    mockUpdateProgress.mockResolvedValue({ ...sampleGoal, progress: 50 });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGoalUpdate } = await import("../../src/commands/goal.js");
    await runGoalUpdate("goal-2026-001", { progress: "50" });
    expect(mockUpdateProgress).toHaveBeenCalledWith(expect.any(String), "goal-2026-001", 50);
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("50");
    logSpy.mockRestore();
  });

  it("exits with error on invalid progress value", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runGoalUpdate } = await import("../../src/commands/goal.js");
    await expect(runGoalUpdate("goal-001", { progress: "abc" })).rejects.toThrow("exit");
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("exits with error when goal not found", async () => {
    mockUpdateProgress.mockResolvedValue(null);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runGoalUpdate } = await import("../../src/commands/goal.js");
    await expect(runGoalUpdate("nonexistent", { progress: "50" })).rejects.toThrow("exit");
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe("runGoalCancel", () => {
  it("calls cancelGoal and confirms cancellation", async () => {
    mockCancel.mockResolvedValue(true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGoalCancel } = await import("../../src/commands/goal.js");
    await runGoalCancel("goal-2026-001");
    expect(mockCancel).toHaveBeenCalledWith(expect.any(String), "goal-2026-001");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("goal-2026-001");
    logSpy.mockRestore();
  });

  it("exits with error when goal not found", async () => {
    mockCancel.mockResolvedValue(false);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runGoalCancel } = await import("../../src/commands/goal.js");
    await expect(runGoalCancel("missing")).rejects.toThrow("exit");
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe("goalCommand — Commander structure", () => {
  it("exports goalCommand with name 'goal'", async () => {
    const { goalCommand } = await import("../../src/commands/goal.js");
    expect(goalCommand.name()).toBe("goal");
  });

  it("has 'set' subcommand", async () => {
    const { goalCommand } = await import("../../src/commands/goal.js");
    const names = goalCommand.commands.map((c) => c.name());
    expect(names).toContain("set");
  });

  it("has 'status' subcommand", async () => {
    const { goalCommand } = await import("../../src/commands/goal.js");
    const names = goalCommand.commands.map((c) => c.name());
    expect(names).toContain("status");
  });

  it("has 'update' subcommand", async () => {
    const { goalCommand } = await import("../../src/commands/goal.js");
    const names = goalCommand.commands.map((c) => c.name());
    expect(names).toContain("update");
  });

  it("has 'cancel' subcommand", async () => {
    const { goalCommand } = await import("../../src/commands/goal.js");
    const names = goalCommand.commands.map((c) => c.name());
    expect(names).toContain("cancel");
  });
});

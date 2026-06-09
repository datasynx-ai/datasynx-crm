import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Task } from "../../src/schemas/task.js";

const mockReadTasks = vi.hoisted(() => vi.fn());
const mockAppendTask = vi.hoisted(() => vi.fn());
const mockUpdateTask = vi.hoisted(() => vi.fn());

vi.mock("../../src/fs/task-store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/fs/task-store.js")>();
  return {
    ...actual,
    readTasks: mockReadTasks,
    appendTask: mockAppendTask,
    updateTask: mockUpdateTask,
  };
});

const DATA_DIR = "/data";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task_1",
    title: "Follow up with Acme",
    slug: "acme-corp",
    dueDate: "2026-06-09",
    status: "open",
    priority: "normal",
    createdAt: "2026-06-01T00:00:00.000Z",
    source: "manual",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env["DXCRM_DATA_DIR"] = DATA_DIR;
});

describe("taskCommand", () => {
  it("add creates a task", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { taskCommand } = await import("../../src/commands/task.js");
    await taskCommand.parseAsync([
      "node",
      "task",
      "add",
      "Call CFO",
      "--due",
      "2026-06-12",
      "--slug",
      "acme-corp",
      "--priority",
      "high",
    ]);
    expect(mockAppendTask).toHaveBeenCalledOnce();
    const task = mockAppendTask.mock.calls[0]![1] as Task;
    expect(task.title).toBe("Call CFO");
    expect(task.dueDate).toBe("2026-06-12");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("created"));
    consoleSpy.mockRestore();
  });

  it("list shows open tasks", async () => {
    mockReadTasks.mockReturnValue([makeTask()]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { taskCommand } = await import("../../src/commands/task.js");
    await taskCommand.parseAsync(["node", "task", "list"]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Follow up with Acme"));
    consoleSpy.mockRestore();
  });

  it("done completes a task", async () => {
    mockUpdateTask.mockResolvedValue(makeTask({ status: "done" }));
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { taskCommand } = await import("../../src/commands/task.js");
    await taskCommand.parseAsync(["node", "task", "done", "task_1"]);
    expect(mockUpdateTask).toHaveBeenCalledWith(
      DATA_DIR,
      "task_1",
      expect.objectContaining({ status: "done" })
    );
    consoleSpy.mockRestore();
  });

  it("snooze defers a task", async () => {
    mockUpdateTask.mockResolvedValue(makeTask({ status: "snoozed", snoozedUntil: "2026-06-20" }));
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { taskCommand } = await import("../../src/commands/task.js");
    await taskCommand.parseAsync(["node", "task", "snooze", "task_1", "--until", "2026-06-20"]);
    expect(mockUpdateTask).toHaveBeenCalledWith(
      DATA_DIR,
      "task_1",
      expect.objectContaining({ status: "snoozed", snoozedUntil: "2026-06-20" })
    );
    consoleSpy.mockRestore();
  });
});

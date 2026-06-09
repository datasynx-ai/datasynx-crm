import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import type { Task } from "../../src/schemas/task.js";

const DATA_DIR = "/data";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task_1",
    title: "Follow up with Acme",
    slug: "acme-corp",
    dueDate: "2026-06-12",
    status: "open",
    priority: "normal",
    createdAt: "2026-06-09T10:00:00.000Z",
    source: "manual",
    ...overrides,
  };
}

beforeEach(() => vol.reset());

describe("task-store (NDJSON)", () => {
  it("readTasks returns [] when the file is absent", async () => {
    const { readTasks } = await import("../../src/fs/task-store.js");
    expect(readTasks(DATA_DIR)).toEqual([]);
  });

  it("appendTask + readTasks round-trips tasks", async () => {
    const { appendTask, readTasks } = await import("../../src/fs/task-store.js");
    appendTask(DATA_DIR, makeTask());
    appendTask(DATA_DIR, makeTask({ id: "task_2", title: "Send proposal" }));
    const tasks = readTasks(DATA_DIR);
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.id)).toEqual(["task_1", "task_2"]);
  });

  it("skips malformed lines instead of failing the whole read", async () => {
    const { appendTask, readTasks } = await import("../../src/fs/task-store.js");
    appendTask(DATA_DIR, makeTask());
    const { tasksPath } = await import("../../src/fs/task-store.js");
    const fs = (await import("fs")).default;
    fs.appendFileSync(tasksPath(DATA_DIR), "{not json}\n", "utf-8");
    expect(readTasks(DATA_DIR)).toHaveLength(1);
  });

  it("updateTask patches a task and persists the change", async () => {
    const { appendTask, updateTask, readTasks } = await import("../../src/fs/task-store.js");
    appendTask(DATA_DIR, makeTask());
    const updated = await updateTask(DATA_DIR, "task_1", {
      status: "done",
      completedAt: "2026-06-10T08:00:00.000Z",
    });
    expect(updated?.status).toBe("done");
    expect(readTasks(DATA_DIR)[0]?.status).toBe("done");
  });

  it("updateTask returns null for an unknown id", async () => {
    const { updateTask } = await import("../../src/fs/task-store.js");
    expect(await updateTask(DATA_DIR, "ghost", { status: "done" })).toBeNull();
  });
});

describe("isTaskDue", () => {
  it("open task is due on and after its dueDate, not before", async () => {
    const { isTaskDue } = await import("../../src/fs/task-store.js");
    const task = makeTask({ dueDate: "2026-06-12" });
    expect(isTaskDue(task, "2026-06-11")).toBe(false);
    expect(isTaskDue(task, "2026-06-12")).toBe(true);
    expect(isTaskDue(task, "2026-06-13")).toBe(true);
  });

  it("done tasks are never due", async () => {
    const { isTaskDue } = await import("../../src/fs/task-store.js");
    expect(isTaskDue(makeTask({ status: "done" }), "2026-07-01")).toBe(false);
  });

  it("snoozed tasks become due again at snoozedUntil", async () => {
    const { isTaskDue } = await import("../../src/fs/task-store.js");
    const task = makeTask({ status: "snoozed", snoozedUntil: "2026-06-20" });
    expect(isTaskDue(task, "2026-06-15")).toBe(false);
    expect(isTaskDue(task, "2026-06-20")).toBe(true);
  });
});

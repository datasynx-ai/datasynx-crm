import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";

const DATA_DIR = "/data";

function parse(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

beforeEach(() => {
  vol.reset();
  delete process.env["DXCRM_ACTOR"];
});

describe("create_task / complete_task / snooze_task / list_tasks", () => {
  it("create_task creates an open task and returns it", async () => {
    const { handleCreateTask } = await import("../../../src/mcp/tools/create-task.js");
    const res = parse(
      await handleCreateTask(
        { title: "Call CFO", slug: "acme-corp", dueDate: "2026-06-12", priority: "high" },
        DATA_DIR
      )
    );
    expect(res["success"]).toBe(true);
    const task = res["task"] as { id: string; status: string; priority: string };
    expect(task.status).toBe("open");
    expect(task.priority).toBe("high");

    const { readTasks } = await import("../../../src/fs/task-store.js");
    expect(readTasks(DATA_DIR)).toHaveLength(1);
  });

  it("agent flow: create a dated reminder, then complete it", async () => {
    const { handleCreateTask } = await import("../../../src/mcp/tools/create-task.js");
    const created = parse(
      await handleCreateTask({ title: "Remind me re Acme", dueDate: "2026-06-13" }, DATA_DIR)
    );
    const id = (created["task"] as { id: string }).id;

    const { handleCompleteTask } = await import("../../../src/mcp/tools/complete-task.js");
    const done = parse(await handleCompleteTask({ taskId: id }, DATA_DIR));
    expect(done["success"]).toBe(true);
    expect((done["task"] as { status: string }).status).toBe("done");
  });

  it("snooze_task moves the task to snoozed with a date", async () => {
    const { handleCreateTask } = await import("../../../src/mcp/tools/create-task.js");
    const created = parse(
      await handleCreateTask({ title: "Ping later", dueDate: "2026-06-10" }, DATA_DIR)
    );
    const id = (created["task"] as { id: string }).id;

    const { handleSnoozeTask } = await import("../../../src/mcp/tools/snooze-task.js");
    const res = parse(await handleSnoozeTask({ taskId: id, until: "2026-06-20" }, DATA_DIR));
    expect((res["task"] as { status: string; snoozedUntil: string }).status).toBe("snoozed");
    expect((res["task"] as { snoozedUntil: string }).snoozedUntil).toBe("2026-06-20");
  });

  it("complete_task returns an error for an unknown id", async () => {
    const { handleCompleteTask } = await import("../../../src/mcp/tools/complete-task.js");
    const res = parse(await handleCompleteTask({ taskId: "ghost" }, DATA_DIR));
    expect(res["success"]).toBe(false);
  });
});

describe("list_tasks filters", () => {
  async function seed() {
    const { appendTask } = await import("../../../src/fs/task-store.js");
    const base = {
      status: "open" as const,
      priority: "normal" as const,
      createdAt: "2026-06-01T00:00:00.000Z",
      source: "manual",
    };
    appendTask(DATA_DIR, {
      ...base,
      id: "t1",
      title: "Due today",
      slug: "acme-corp",
      dueDate: "2026-06-09",
    });
    appendTask(DATA_DIR, {
      ...base,
      id: "t2",
      title: "Overdue",
      slug: "acme-corp",
      dueDate: "2026-06-01",
    });
    appendTask(DATA_DIR, {
      ...base,
      id: "t3",
      title: "Future",
      slug: "beta-gmbh",
      dueDate: "2026-07-01",
    });
    appendTask(DATA_DIR, {
      ...base,
      id: "t4",
      title: "Done",
      slug: "acme-corp",
      dueDate: "2026-06-09",
      status: "done",
    });
    appendTask(DATA_DIR, {
      ...base,
      id: "t5",
      title: "For Bob",
      assignee: "bob",
      dueDate: "2026-06-09",
    });
  }

  it("due=today returns only tasks due exactly today (open)", async () => {
    await seed();
    const { handleListTasks } = await import("../../../src/mcp/tools/list-tasks.js");
    const res = parse(await handleListTasks({ due: "today", today: "2026-06-09" }, DATA_DIR));
    const ids = (res["tasks"] as Array<{ id: string }>).map((t) => t.id);
    expect(ids.sort()).toEqual(["t1", "t5"]);
  });

  it("due=overdue returns open tasks past their due date", async () => {
    await seed();
    const { handleListTasks } = await import("../../../src/mcp/tools/list-tasks.js");
    const res = parse(await handleListTasks({ due: "overdue", today: "2026-06-09" }, DATA_DIR));
    const ids = (res["tasks"] as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toEqual(["t2"]);
  });

  it("filters by slug and assignee", async () => {
    await seed();
    const { handleListTasks } = await import("../../../src/mcp/tools/list-tasks.js");
    const bySlug = parse(await handleListTasks({ slug: "beta-gmbh" }, DATA_DIR));
    expect((bySlug["tasks"] as unknown[]).length).toBe(1);
    const byAssignee = parse(await handleListTasks({ assignee: "bob" }, DATA_DIR));
    expect(((byAssignee["tasks"] as Array<{ id: string }>)[0] ?? {}).id).toBe("t5");
  });

  it("RBAC: a rep only sees tasks for owned customers (plus unbound tasks)", async () => {
    await seed();
    vol.fromJSON({
      "/data/.agentic/rbac.json": JSON.stringify({
        actors: { carol: "rep" },
        owned_customers: { carol: ["acme-corp"] },
      }),
    });
    process.env["DXCRM_ACTOR"] = "carol";
    const { handleListTasks } = await import("../../../src/mcp/tools/list-tasks.js");
    const res = parse(await handleListTasks({}, DATA_DIR));
    const ids = (res["tasks"] as Array<{ id: string }>).map((t) => t.id).sort();
    // beta-gmbh task t3 is hidden; the customer-unbound t5 stays visible.
    expect(ids).toEqual(["t1", "t2", "t4", "t5"]);
  });
});

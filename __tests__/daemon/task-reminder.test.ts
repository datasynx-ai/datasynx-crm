import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const mockEnqueueTask = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/proactive-agent.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/core/proactive-agent.js")>();
  return { ...actual, enqueueTask: mockEnqueueTask };
});

const DATA_DIR = "/data";
const TODAY = "2026-06-09";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  mockEnqueueTask.mockResolvedValue({ id: "queued" });
  delete process.env["SLACK_WEBHOOK_URL"];
  delete process.env["TELEGRAM_BOT_TOKEN"];
  delete process.env["TELEGRAM_CHAT_ID"];
});

async function seedTask(overrides: Record<string, unknown> = {}) {
  const { appendTask } = await import("../../src/fs/task-store.js");
  appendTask(DATA_DIR, {
    id: (overrides["id"] as string) ?? "t1",
    title: "Follow up with Acme",
    slug: "acme-corp",
    dueDate: "2026-06-09",
    status: "open",
    priority: "high",
    createdAt: "2026-06-01T00:00:00.000Z",
    source: "manual",
    ...overrides,
  } as never);
}

describe("runTaskReminders", () => {
  it("enqueues one daily summary for due/overdue tasks", async () => {
    process.env["SLACK_WEBHOOK_URL"] = "https://hooks.slack test";
    await seedTask({ id: "t1", dueDate: "2026-06-09" });
    await seedTask({ id: "t2", dueDate: "2026-06-01" }); // overdue
    await seedTask({ id: "t3", dueDate: "2026-07-01" }); // future — not included

    const { runTaskReminders } = await import("../../src/daemon/task-reminder.js");
    const result = await runTaskReminders(DATA_DIR, TODAY);

    expect(result.dueTasks).toBe(2);
    expect(mockEnqueueTask).toHaveBeenCalledOnce();
    const queued = mockEnqueueTask.mock.calls[0]![1] as {
      type: string;
      channel: string;
      payload: { tasks: Array<{ id: string }> };
    };
    expect(queued.type).toBe("task_due_reminder");
    expect(queued.channel).toBe("slack");
    expect(queued.payload.tasks.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
  });

  it("does not remind twice on the same day (remindedOn guard)", async () => {
    await seedTask({ id: "t1" });
    const { runTaskReminders } = await import("../../src/daemon/task-reminder.js");
    await runTaskReminders(DATA_DIR, TODAY);
    const second = await runTaskReminders(DATA_DIR, TODAY);
    expect(second.dueTasks).toBe(0);
    expect(mockEnqueueTask).toHaveBeenCalledOnce();
  });

  it("does nothing when no task is due", async () => {
    await seedTask({ id: "t1", dueDate: "2099-01-01" });
    const { runTaskReminders } = await import("../../src/daemon/task-reminder.js");
    const result = await runTaskReminders(DATA_DIR, TODAY);
    expect(result.dueTasks).toBe(0);
    expect(mockEnqueueTask).not.toHaveBeenCalled();
  });
});

describe("formatTaskMessage — task_due_reminder", () => {
  it("renders a daily task queue message", async () => {
    const { formatTaskMessage } = await import("../../src/core/notification-dispatcher.js");
    const msg = formatTaskMessage({
      id: "q1",
      type: "task_due_reminder",
      priority: "high",
      payload: {
        date: TODAY,
        tasks: [
          {
            id: "t1",
            title: "Follow up with Acme",
            slug: "acme-corp",
            dueDate: "2026-06-09",
            priority: "high",
          },
          {
            id: "t2",
            title: "Send proposal",
            slug: "beta-gmbh",
            dueDate: "2026-06-01",
            priority: "normal",
          },
        ],
      },
      createdAt: TODAY,
      scheduledFor: TODAY,
      status: "pending",
      channel: "slack",
    } as never);
    expect(msg).toContain("Follow up with Acme");
    expect(msg).toContain("Send proposal");
    expect(msg).toMatch(/task|aufgabe/i);
  });
});

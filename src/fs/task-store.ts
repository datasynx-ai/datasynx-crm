import fs from "fs";
import path from "path";
import { TaskSchema, type Task } from "../schemas/task.js";
import { writeFileAtomic } from "./atomic-write.js";
import { withFileQueue } from "./write-queue.js";

/** Append-only NDJSON task store (issue #46): one JSON object per line. */
export function tasksPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "tasks.ndjson");
}

/** Read every task; malformed lines are skipped, never fatal. */
export function readTasks(dataDir: string): Task[] {
  const p = tasksPath(dataDir);
  if (!fs.existsSync(p)) return [];
  const content = fs.readFileSync(p, "utf-8") as string;
  const tasks: Task[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = TaskSchema.safeParse(JSON.parse(trimmed));
      if (parsed.success) tasks.push(parsed.data);
    } catch {
      // skip malformed line
    }
  }
  return tasks;
}

export function appendTask(dataDir: string, task: Task): void {
  const p = tasksPath(dataDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(TaskSchema.parse(task)) + "\n", "utf-8");
}

/** Patch a task by id; rewrites the file atomically (queued per file). */
export async function updateTask(
  dataDir: string,
  id: string,
  updates: Partial<Task>
): Promise<Task | null> {
  const p = tasksPath(dataDir);
  return withFileQueue(p, async () => {
    const tasks = readTasks(dataDir);
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx < 0) return null;
    const merged = TaskSchema.parse({ ...tasks[idx], ...updates });
    tasks[idx] = merged;
    writeFileAtomic(p, tasks.map((t) => JSON.stringify(t)).join("\n") + "\n");
    return merged;
  });
}

/**
 * A task is due when it is actionable on `today`:
 * - open: dueDate ≤ today
 * - snoozed: snoozedUntil ≤ today (snooze defers, then it resurfaces)
 * - done: never
 */
export function isTaskDue(task: Task, today: string): boolean {
  if (task.status === "done") return false;
  if (task.status === "snoozed") {
    return task.snoozedUntil !== undefined && task.snoozedUntil <= today;
  }
  return task.dueDate <= today;
}

export function newTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

import { Command } from "commander";
import { success, error, info, bold } from "../ui/colors.js";
import { readTasks, appendTask, updateTask, isTaskDue, newTaskId } from "../fs/task-store.js";
import type { Task } from "../schemas/task.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const taskCommand = new Command("task").description(
  "First-class tasks & reminders with due dates"
);

taskCommand
  .command("add <title>")
  .description("Create a task / dated reminder")
  .requiredOption("--due <date>", "Due date YYYY-MM-DD")
  .option("--slug <slug>", "Customer slug")
  .option("--priority <priority>", "high | normal | low", "normal")
  .option("--assignee <actor>", "Assignee (RBAC actor)")
  .action(
    (title: string, opts: { due: string; slug?: string; priority: string; assignee?: string }) => {
      const priority = ["high", "normal", "low"].includes(opts.priority)
        ? (opts.priority as Task["priority"])
        : "normal";
      const task: Task = {
        id: newTaskId(),
        title,
        dueDate: opts.due,
        status: "open",
        priority,
        source: "manual",
        createdAt: new Date().toISOString(),
        ...(opts.slug ? { slug: opts.slug } : {}),
        ...(opts.assignee ? { assignee: opts.assignee } : {}),
      };
      appendTask(dataDir(), task);
      console.log(success(`✓ Task '${task.id}' created — due ${opts.due}`));
    }
  );

taskCommand
  .command("list")
  .description("List tasks (default: open)")
  .option("--all", "Include done/snoozed tasks")
  .option("--due", "Only tasks due today or overdue")
  .option("--slug <slug>", "Filter by customer")
  .action((opts: { all?: boolean; due?: boolean; slug?: string }) => {
    const today = new Date().toISOString().slice(0, 10);
    let tasks = readTasks(dataDir());
    if (opts.slug) tasks = tasks.filter((t) => t.slug === opts.slug);
    if (!opts.all) tasks = tasks.filter((t) => t.status !== "done");
    if (opts.due) tasks = tasks.filter((t) => isTaskDue(t, today));
    if (tasks.length === 0) {
      console.log(info("No tasks found."));
      return;
    }
    for (const t of tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
      const overdue = t.status !== "done" && t.dueDate < today ? " ⚠ overdue" : "";
      const slugPart = t.slug ? `  [${t.slug}]` : "";
      console.log(
        `  ${bold(t.id)}  ${t.dueDate}  ${t.title}${slugPart}  (${t.status}/${t.priority})${overdue}`
      );
    }
  });

taskCommand
  .command("done <taskId>")
  .description("Mark a task as done")
  .action(async (taskId: string) => {
    const task = await updateTask(dataDir(), taskId, {
      status: "done",
      completedAt: new Date().toISOString(),
    });
    if (!task) {
      console.error(error(`Task '${taskId}' not found`));
      process.exit(1);
    }
    console.log(success(`✓ Done: ${task.title}`));
  });

taskCommand
  .command("snooze <taskId>")
  .description("Defer a task until a later date")
  .requiredOption("--until <date>", "Resurface date YYYY-MM-DD")
  .action(async (taskId: string, opts: { until: string }) => {
    const task = await updateTask(dataDir(), taskId, {
      status: "snoozed",
      snoozedUntil: opts.until,
    });
    if (!task) {
      console.error(error(`Task '${taskId}' not found`));
      process.exit(1);
    }
    console.log(success(`✓ Snoozed until ${opts.until}: ${task.title}`));
  });

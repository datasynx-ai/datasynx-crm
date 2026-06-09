import { readTasks, updateTask, isTaskDue } from "../fs/task-store.js";
import { enqueueTask, type NotificationChannel } from "../core/proactive-agent.js";
import { logger } from "../core/logger.js";

export interface TaskReminderResult {
  today: string;
  /** Number of due/overdue tasks included in today's reminder. */
  dueTasks: number;
}

function reminderChannel(): NotificationChannel {
  if (process.env["TELEGRAM_BOT_TOKEN"] && process.env["TELEGRAM_CHAT_ID"]) return "telegram";
  if (process.env["SLACK_WEBHOOK_URL"]) return "slack";
  return "mcp_tool_response";
}

/**
 * Daily task queue (issue #46): collect all due/overdue tasks that have not
 * been reminded today, enqueue ONE summary into the proactive queue (the
 * notification dispatcher delivers it to Slack/Telegram), and stamp each task
 * with remindedOn so the cron cycle (every N minutes) doesn't spam.
 */
export async function runTaskReminders(
  dataDir: string,
  today: string = new Date().toISOString().slice(0, 10)
): Promise<TaskReminderResult> {
  const due = readTasks(dataDir).filter((t) => isTaskDue(t, today) && t.remindedOn !== today);
  if (due.length === 0) return { today, dueTasks: 0 };

  await enqueueTask(dataDir, {
    type: "task_due_reminder",
    priority: "high",
    payload: {
      date: today,
      tasks: due.map((t) => ({
        id: t.id,
        title: t.title,
        slug: t.slug,
        dueDate: t.dueDate,
        priority: t.priority,
        assignee: t.assignee,
      })),
    },
    scheduledFor: new Date().toISOString(),
    channel: reminderChannel(),
  });

  for (const t of due) {
    await updateTask(dataDir, t.id, { remindedOn: today });
  }

  logger.info("daemon", "task reminders enqueued", { count: due.length, today });
  return { today, dueTasks: due.length };
}

import { z } from "zod";

/**
 * First-class task / reminder with a due date (issue #46). Stored append-only
 * in `.agentic/tasks.ndjson`; status changes rewrite the file atomically.
 */
export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** Customer this task belongs to; omitted for customer-unbound reminders. */
  slug: z.string().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  status: z.enum(["open", "done", "snoozed"]),
  priority: z.enum(["high", "normal", "low"]).default("normal"),
  /** RBAC actor the task is assigned to. */
  assignee: z.string().optional(),
  /** Deal name this task relates to. */
  linkedDeal: z.string().optional(),
  /** Where the task came from: manual | agent | nba | … */
  source: z.string().default("manual"),
  createdAt: z.string(),
  completedAt: z.string().optional(),
  /** When snoozed: the date the task becomes due again. */
  snoozedUntil: z.string().optional(),
  /** Last date (YYYY-MM-DD) a daemon reminder was sent for this task. */
  remindedOn: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

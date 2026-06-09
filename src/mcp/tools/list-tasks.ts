import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readTasks, isTaskDue } from "../../fs/task-store.js";
import { customerVisibility } from "../../core/rbac.js";
import { getActor } from "../../fs/audit-log.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleListTasks(
  input: {
    due?: "today" | "overdue";
    slug?: string;
    assignee?: string;
    status?: "open" | "done" | "snoozed";
    today?: string;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const today = input.today ?? new Date().toISOString().slice(0, 10);
    // RBAC: customer-bound tasks are only visible when the customer is
    // (mirrors list_customers); customer-unbound reminders stay visible.
    const canSee = customerVisibility(dataDir, getActor());

    const tasks = readTasks(dataDir).filter((t) => {
      if (t.slug && !canSee(t.slug)) return false;
      if (input.slug && t.slug !== input.slug) return false;
      if (input.assignee && t.assignee !== input.assignee) return false;
      if (input.status && t.status !== input.status) return false;
      if (input.due === "today") {
        return t.status !== "done" && isTaskDue(t, today) && !isTaskDue(t, addDays(today, -1));
      }
      if (input.due === "overdue") {
        return t.status !== "done" && isTaskDue(t, addDays(today, -1));
      }
      return true;
    });

    return {
      content: [
        { type: "text", text: JSON.stringify({ today, count: tasks.length, tasks }, null, 2) },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2),
        },
      ],
    };
  }
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function registerListTasks(server: McpServer): void {
  server.registerTool(
    "list_tasks",
    {
      title: "List Tasks",
      description: `List tasks/reminders — the rep's "what is due today?" view. RBAC-aware:
customer-bound tasks are only visible when the customer is; manager/admin see all.

Args:
  due: "today" (due exactly today) | "overdue" (open & past due) — omit for all
  slug / assignee / status: optional filters

Returns: { today, count, tasks: [{ id, title, dueDate, status, priority, slug?, assignee? }] }`,
      inputSchema: z.object({
        due: z.enum(["today", "overdue"]).optional().describe("Due-date filter"),
        slug: z.string().optional().describe("Filter by customer slug"),
        assignee: z.string().optional().describe("Filter by assignee"),
        status: z.enum(["open", "done", "snoozed"]).optional().describe("Filter by status"),
      }),
    },
    async (input) =>
      handleListTasks({
        ...(input.due !== undefined ? { due: input.due } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.assignee !== undefined ? { assignee: input.assignee } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
  );
}

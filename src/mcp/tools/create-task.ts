import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { appendTask, newTaskId } from "../../fs/task-store.js";
import { enforceRbac } from "../../core/rbac.js";
import { writeAuditEntry, getActor } from "../../fs/audit-log.js";
import type { Task } from "../../schemas/task.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleCreateTask(
  input: {
    title: string;
    dueDate: string;
    slug?: string;
    priority?: "high" | "normal" | "low";
    assignee?: string;
    linkedDeal?: string;
    source?: string;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    enforceRbac(dataDir, "create_task");
    const task: Task = {
      id: newTaskId(),
      title: input.title,
      dueDate: input.dueDate,
      status: "open",
      priority: input.priority ?? "normal",
      source: input.source ?? "manual",
      createdAt: new Date().toISOString(),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.assignee !== undefined ? { assignee: input.assignee } : {}),
      ...(input.linkedDeal !== undefined ? { linkedDeal: input.linkedDeal } : {}),
    };
    appendTask(dataDir, task);
    writeAuditEntry(dataDir, {
      timestamp: new Date().toISOString(),
      actor: getActor(),
      tool: "create_task",
      slug: input.slug ?? "-",
      summary: `${input.title} (due ${input.dueDate})`,
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, task }, null, 2) }],
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

export function registerCreateTask(server: McpServer): void {
  server.registerTool(
    "create_task",
    {
      title: "Create Task",
      description: `Create a first-class task / dated reminder ("remind me Friday about Acme").
Tasks are the binding follow-up mechanism: the daemon pushes due/overdue tasks
to Slack/Telegram daily. Use this instead of a loose recommendation whenever a
follow-up has a date.

Returns: { success, task: { id, title, dueDate, status: "open", priority, slug?, assignee? } }`,
      inputSchema: z.object({
        title: z.string().describe("What to do"),
        dueDate: z.string().describe("Due date YYYY-MM-DD"),
        slug: z.string().optional().describe("Customer slug this task belongs to"),
        priority: z.enum(["high", "normal", "low"]).optional().describe("Default: normal"),
        assignee: z.string().optional().describe("RBAC actor the task is assigned to"),
        linkedDeal: z.string().optional().describe("Deal name this task relates to"),
        source: z.string().optional().describe("Origin: manual | agent | nba (default: manual)"),
      }),
    },
    async (input) =>
      handleCreateTask({
        title: input.title,
        dueDate: input.dueDate,
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.assignee !== undefined ? { assignee: input.assignee } : {}),
        ...(input.linkedDeal !== undefined ? { linkedDeal: input.linkedDeal } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
      })
  );
}

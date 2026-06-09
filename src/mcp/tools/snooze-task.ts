import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { updateTask } from "../../fs/task-store.js";
import { enforceRbac } from "../../core/rbac.js";
import { writeAuditEntry, getActor } from "../../fs/audit-log.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleSnoozeTask(
  input: { taskId: string; until: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    enforceRbac(dataDir, "snooze_task");
    const task = await updateTask(dataDir, input.taskId, {
      status: "snoozed",
      snoozedUntil: input.until,
    });
    if (!task) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: false, error: `Task '${input.taskId}' not found` },
              null,
              2
            ),
          },
        ],
      };
    }
    writeAuditEntry(dataDir, {
      timestamp: new Date().toISOString(),
      actor: getActor(),
      tool: "snooze_task",
      slug: task.slug ?? "-",
      summary: `${task.title} → ${input.until}`,
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

export function registerSnoozeTask(server: McpServer): void {
  server.registerTool(
    "snooze_task",
    {
      title: "Snooze Task",
      description: `Defer a task/reminder: it disappears from "due today" and resurfaces on the
given date (daemon reminders included).

Returns: { success, task } or { success: false, error } when the id is unknown.`,
      inputSchema: z.object({
        taskId: z.string().describe("Task id"),
        until: z.string().describe("Resurface date YYYY-MM-DD"),
      }),
    },
    async ({ taskId, until }) => handleSnoozeTask({ taskId, until })
  );
}

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { updateTask } from "../../fs/task-store.js";
import { enforceRbac } from "../../core/rbac.js";
import { writeAuditEntry, getActor } from "../../fs/audit-log.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleCompleteTask(
  input: { taskId: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    enforceRbac(dataDir, "complete_task");
    const task = await updateTask(dataDir, input.taskId, {
      status: "done",
      completedAt: new Date().toISOString(),
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
      tool: "complete_task",
      slug: task.slug ?? "-",
      summary: task.title,
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

export function registerCompleteTask(server: McpServer): void {
  server.registerTool(
    "complete_task",
    {
      title: "Complete Task",
      description: `Mark a task/reminder as done (sets completedAt).

Returns: { success, task } or { success: false, error } when the id is unknown.`,
      inputSchema: z.object({
        taskId: z.string().describe("Task id (from create_task / list_tasks)"),
      }),
    },
    async ({ taskId }) => handleCompleteTask({ taskId })
  );
}

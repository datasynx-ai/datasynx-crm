import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readAgentQueue, writeAgentQueue, executeAction } from "../../agents/deal-agent.js";

export { readAgentQueue } from "../../agents/deal-agent.js";

const DATA_DIR = process.cwd();

export async function handleApproveAgentAction(
  input: { slug: string; actionId: string; approved: boolean },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const queue = readAgentQueue(dataDir, input.slug);
    const idx = queue.pendingActions.findIndex((a) => a.actionId === input.actionId);

    if (idx === -1) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: false, error: `Action ${input.actionId} not found in queue` },
              null,
              2
            ),
          },
        ],
      };
    }

    const action = queue.pendingActions[idx]!;

    if (!input.approved) {
      queue.pendingActions[idx] = { ...action, status: "rejected" };
      writeAgentQueue(dataDir, input.slug, queue);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: true, actionId: input.actionId, status: "rejected" },
              null,
              2
            ),
          },
        ],
      };
    }

    const outcome = await executeAction(action, dataDir);
    queue.pendingActions[idx] = {
      ...action,
      status: outcome === "executed" ? "executed" : "skipped",
    };
    writeAgentQueue(dataDir, input.slug, queue);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              actionId: input.actionId,
              status: queue.pendingActions[idx]!.status,
            },
            null,
            2
          ),
        },
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

export function registerApproveAgentAction(server: McpServer): void {
  server.registerTool(
    "approve_agent_action",
    {
      title: "Approve Agent Action",
      description: `Approve or reject a pending action from the deal agent queue.

Find actionId in the actionsQueued array returned by run_deal_agent.

Args:
  slug: Customer slug
  actionId: Action ID from the agent queue
  approved: true to execute, false to reject

Returns: { success, actionId, status }`,
      inputSchema: z.object({
        slug: z.string(),
        actionId: z.string(),
        approved: z.boolean(),
      }),
    },
    async ({ slug, actionId, approved }) =>
      handleApproveAgentAction({ slug, actionId, approved })
  );
}

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeVelocity } from "../../core/velocity.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleGetPipelineVelocity(
  input: { stalledDays?: number },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const opts: { stalledDays?: number } = {};
  if (input.stalledDays !== undefined) opts.stalledDays = input.stalledDays;
  const report = analyzeVelocity(dataDir, opts);
  return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
}

export function registerGetPipelineVelocity(server: McpServer): void {
  server.registerTool(
    "get_pipeline_velocity",
    {
      title: "Get Pipeline Velocity",
      description: `Pipeline velocity analytics from the daily snapshot history.
Reconstructs each deal's stage journey to answer "where do deals get stuck?"
and "which deals are rotting?".

Args:
  stalledDays: A deal open in the same stage longer than this is "stalled"
    (default 14).

Returns: { fromId, toId, snapshotCount, stageDurations[{stage,avgDays,samples}],
avgSalesCycleDays, wonCount, stalledDeals[{slug,name,stage,daysInStage,value}],
stalledThresholdDays }. snapshotCount is 0 until the daemon has taken snapshots.`,
      inputSchema: z.object({
        stalledDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe("Days in one stage before a deal counts as stalled (default 14)"),
      }),
    },
    async ({ stalledDays }) => {
      const input: { stalledDays?: number } = {};
      if (stalledDays !== undefined) input.stalledDays = stalledDays;
      return handleGetPipelineVelocity(input);
    }
  );
}

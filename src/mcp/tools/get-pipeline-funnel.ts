import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeFunnel } from "../../core/funnel.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleGetPipelineFunnel(
  input: { pipelineId?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const report = analyzeFunnel(
    dataDir,
    input.pipelineId !== undefined ? { pipelineId: input.pipelineId } : {}
  );
  return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
}

export function registerGetPipelineFunnel(server: McpServer): void {
  server.registerTool(
    "get_pipeline_funnel",
    {
      title: "Get Pipeline Funnel",
      description: `Pipeline conversion funnel & win-rate from the daily snapshot history.
For each deal it tracks the furthest stage reached and the win/lost outcome,
then builds a cumulative funnel. Answers "where do deals leak out of my
pipeline?" and "what's my win rate?".

Returns: { fromId, toId, snapshotCount,
stages[{stage, reached, conversionPctToNext}], wonCount, lostCount, winRatePct,
biggestLeak{from,to,conversionPct} }. snapshotCount is 0 until the daemon has
taken snapshots. Pass pipelineId to scope the funnel to one pipeline (#47).`,
      inputSchema: z.object({
        pipelineId: z.string().optional().describe("Scope to one pipeline"),
      }),
    },
    async ({ pipelineId }) =>
      handleGetPipelineFunnel(pipelineId !== undefined ? { pipelineId } : {})
  );
}

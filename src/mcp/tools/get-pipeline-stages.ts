import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPipelineStages } from "../../core/pipeline-stages.js";

const DATA_DIR = process.cwd();

export async function handleGetPipelineStages(
  _input: Record<string, never>,
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const stages = getPipelineStages(dataDir);
  return {
    content: [{ type: "text", text: JSON.stringify({ stages }, null, 2) }],
  };
}

export function registerGetPipelineStages(server: McpServer): void {
  server.registerTool(
    "get_pipeline_stages",
    {
      title: "Get Pipeline Stages",
      description: "Returns all configured pipeline stages. Falls back to default stages (lead, qualified, proposal, negotiation, won, lost) if no custom stages are configured.",
      inputSchema: z.object({}),
    },
    async () => handleGetPipelineStages({})
  );
}

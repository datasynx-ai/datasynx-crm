import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listPipelines, getPipelineDef } from "../../core/pipelines.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleGetPipelineStages(
  input: { pipelineId?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  if (input.pipelineId) {
    const def = getPipelineDef(dataDir, input.pipelineId);
    if (!def) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Pipeline '${input.pipelineId}' not found` }),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ pipeline: def.id, label: def.label, stages: def.stages }, null, 2),
        },
      ],
    };
  }
  const pipelines = listPipelines(dataDir);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            // Back-compat: `stages` remains the default pipeline's stages.
            stages: pipelines[0]!.stages,
            pipelines: pipelines.map((p) => ({
              id: p.id,
              label: p.label,
              stageCount: p.stages.length,
            })),
          },
          null,
          2
        ),
      },
    ],
  };
}

export function registerGetPipelineStages(server: McpServer): void {
  server.registerTool(
    "get_pipeline_stages",
    {
      title: "Get Pipeline Stages",
      description:
        "Returns pipeline stages. Without pipelineId: the default pipeline's stages plus the list of all pipelines. With pipelineId: that pipeline's own stage set (#47). Every pipeline keeps won/lost as final stages.",
      inputSchema: z.object({
        pipelineId: z.string().optional().describe("Named pipeline (default: 'default')"),
      }),
    },
    async ({ pipelineId }) =>
      handleGetPipelineStages(pipelineId !== undefined ? { pipelineId } : {})
  );
}

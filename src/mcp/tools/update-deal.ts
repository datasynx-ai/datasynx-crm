import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { upsertDeal, readPipeline } from "../../fs/pipeline-writer.js";
import type { PipelineDeal } from "../../schemas/pipeline.js";
import { writeAuditEntry, getActor } from "../../fs/audit-log.js";
import { enforceRbac } from "../../core/rbac.js";
import { validStageIds, dealPipelineId, DEFAULT_PIPELINE_ID } from "../../core/pipelines.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleUpdateDeal(
  input: {
    slug: string;
    dealName: string;
    stage?: string;
    value?: number;
    probability?: number;
    closeDate?: string;
    notes?: string;
    pipelineId?: string;
  },
  dataDir: string = DATA_DIR
): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const today = new Date().toISOString().split("T")[0] as string;

  try {
    enforceRbac(dataDir, "update_deal");

    // Upsert by name: merge the provided fields over the existing deal so a
    // partial update (e.g. only `stage`) does not wipe value/probability/etc.
    const existing = (await readPipeline(dataDir, input.slug)).find(
      (d) => d.name === input.dealName
    );

    // Pipeline-aware stage validation (#47): the stage must exist in the
    // deal's pipeline (explicit pipelineId > existing deal > default).
    const pipelineId = input.pipelineId ?? dealPipelineId(existing ?? {});
    const stages = validStageIds(dataDir, pipelineId);
    if (!stages) {
      throw new Error(
        `Pipeline '${pipelineId}' not found. Create it with 'dxcrm pipeline create'.`
      );
    }
    const stage = input.stage ?? existing?.stage ?? "lead";
    if (!stages.has(stage)) {
      throw new Error(
        `Stage '${stage}' is not defined in pipeline '${pipelineId}' (valid: ${[...stages].join(", ")}).`
      );
    }

    const value = input.value ?? existing?.value;
    const probability = input.probability ?? existing?.probability;
    const closeDate = input.closeDate ?? existing?.close_date;
    const notes = input.notes ?? existing?.notes;

    const deal: PipelineDeal = {
      name: input.dealName,
      stage,
      currency: existing?.currency ?? "EUR",
      updated: today,
      ...(pipelineId !== DEFAULT_PIPELINE_ID ? { pipeline: pipelineId } : {}),
      ...(existing?.owner !== undefined ? { owner: existing.owner } : {}),
      ...(value !== undefined ? { value } : {}),
      ...(probability !== undefined ? { probability } : {}),
      ...(closeDate !== undefined ? { close_date: closeDate } : {}),
      ...(notes !== undefined ? { notes } : {}),
    };

    await upsertDeal(dataDir, input.slug, deal);

    writeAuditEntry(dataDir, {
      timestamp: new Date().toISOString(),
      actor: getActor(),
      tool: "update_deal",
      slug: input.slug,
      summary: input.dealName,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              deal,
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
          text: JSON.stringify(
            {
              success: false,
              error: (err as Error).message,
            },
            null,
            2
          ),
        },
      ],
    };
  }
}

export function registerUpdateDeal(server: McpServer): void {
  server.registerTool(
    "update_deal",
    {
      title: "Update Deal",
      description: `Update or create a deal in the customer's pipeline. Upserts by deal name.
Use after pipeline discussions or when deal status changes.

Args:
  slug: Customer ID
  dealName: Deal name (used as unique key for upsert)
  stage: Deal stage — validated against the deal's pipeline (defaults: lead|qualified|proposal|negotiation|won|lost)
  pipelineId: Named pipeline (e.g. "renewals"); omit for the default pipeline
  value: Deal value in euros
  probability: Win probability percentage (0-100)
  closeDate: Expected close date (YYYY-MM-DD)
  notes: Free-text notes about the deal

Returns: { success: boolean, deal: object }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug (e.g. 'acme-corp')"),
        dealName: z.string().describe("Deal name (unique identifier for upsert)"),
        stage: z.string().optional().describe("Deal stage (validated against the deal's pipeline)"),
        pipelineId: z
          .string()
          .optional()
          .describe("Named pipeline this deal belongs to (default: 'default')"),
        value: z.number().optional().describe("Deal value in euros"),
        probability: z.number().min(0).max(100).optional().describe("Win probability (0-100)"),
        closeDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Expected close date (YYYY-MM-DD)"),
        notes: z.string().optional().describe("Free-text notes about the deal"),
      }),
    },
    async ({ slug, dealName, stage, value, probability, closeDate, notes, pipelineId }) =>
      handleUpdateDeal({
        slug,
        dealName,
        ...(stage !== undefined ? { stage } : {}),
        ...(value !== undefined ? { value } : {}),
        ...(probability !== undefined ? { probability } : {}),
        ...(closeDate !== undefined ? { closeDate } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(pipelineId !== undefined ? { pipelineId } : {}),
      })
  );
}

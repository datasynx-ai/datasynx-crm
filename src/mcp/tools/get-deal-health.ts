import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readPipeline } from "../../fs/pipeline-writer.js";
import { scoreDeal } from "../../core/deal-health.js";
import type { DealHealthScore } from "../../core/deal-health.js";

const DATA_DIR = process.cwd();

export async function handleGetDealHealth(
  input: { slug: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const deals = await readPipeline(dataDir, input.slug);
    const today = new Date();

    const results: Array<{ deal: string; stage: string } & DealHealthScore> = [];

    for (const deal of deals) {
      // Approximate signals from deal metadata
      const updatedDate = deal.updated ? new Date(deal.updated) : today;
      const daysSinceLastActivity = Math.floor(
        (today.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      const daysToClose = deal.close_date
        ? Math.floor(
            (new Date(deal.close_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          )
        : undefined;

      const health = scoreDeal(deal, {
        daysSinceLastActivity,
        daysInCurrentStage: daysSinceLastActivity,
        ...(daysToClose !== undefined ? { daysToClose } : {}),
        ...(deal.probability !== undefined ? { probability: deal.probability } : {}),
      });

      results.push({ deal: deal.name, stage: deal.stage, ...health });
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ slug: input.slug, deals: results }, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2) }],
    };
  }
}

export function registerGetDealHealth(server: McpServer): void {
  server.registerTool(
    "get_deal_health",
    {
      title: "Get Deal Health",
      description: `Score the health of all deals for a customer (0–100). Grade A–F based on activity recency, stage velocity, close date proximity, and probability.

Returns: { slug, deals: [{ deal, stage, score, grade, signals, warnings }] }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
      }),
    },
    async ({ slug }) => handleGetDealHealth({ slug })
  );
}

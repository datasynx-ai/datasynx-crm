import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readPipelineSync } from "../../fs/pipeline-writer.js";
import { listCustomerSlugs } from "../../fs/customer-dir.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

interface ForecastDeal {
  slug: string;
  dealName: string;
  stage: string;
  value?: number | undefined;
  probability?: number | undefined;
  weightedValue: number;
  closeDate?: string | undefined;
}

export async function handleGetPipelineForecast(
  input: { filter?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const slugs = listCustomerSlugs(dataDir).filter(
      (d) => !input.filter || d.includes(input.filter)
    );

    const allDeals: ForecastDeal[] = [];

    for (const slug of slugs) {
      // readPipelineSync already guards a missing file (returns []); no need for
      // a per-iteration existsSync + dynamic import.
      const deals = readPipelineSync(dataDir, slug);

      for (const deal of deals) {
        if (deal.stage === "won" || deal.stage === "lost") continue;
        const prob = deal.probability ?? 50;
        const value = deal.value ?? 0;
        const forecastDeal: ForecastDeal = {
          slug,
          dealName: deal.name,
          stage: deal.stage,
          value,
          probability: prob,
          weightedValue: Math.round((value * prob) / 100),
        };
        if (deal.close_date !== undefined) forecastDeal.closeDate = deal.close_date;
        allDeals.push(forecastDeal);
      }
    }

    const totalWeightedValue = allDeals.reduce((sum, d) => sum + d.weightedValue, 0);
    const byStage = allDeals.reduce<Record<string, { count: number; weightedValue: number }>>(
      (acc, d) => {
        if (!acc[d.stage]) acc[d.stage] = { count: 0, weightedValue: 0 };
        acc[d.stage]!.count++;
        acc[d.stage]!.weightedValue += d.weightedValue;
        return acc;
      },
      {}
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ deals: allDeals, totalWeightedValue, byStage }, null, 2),
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

export function registerGetPipelineForecast(server: McpServer): void {
  server.registerTool(
    "get_pipeline_forecast",
    {
      title: "Get Pipeline Forecast",
      description: `Aggregate weighted pipeline revenue across all customers. Groups open deals by stage, computes probability-weighted expected revenue.

Returns: { deals: [...], totalWeightedValue: number, byStage: { stage: { count, weightedValue } } }`,
      inputSchema: z.object({
        filter: z.string().optional().describe("Filter by customer slug substring"),
      }),
    },
    async ({ filter }) => handleGetPipelineForecast({ ...(filter !== undefined ? { filter } : {}) })
  );
}

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";

const DATA_DIR = process.cwd();

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
    const customersDir = path.join(dataDir, "customers");
    if (!fs.existsSync(customersDir)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ deals: [], totalWeightedValue: 0, byStage: {} }, null, 2),
        }],
      };
    }

    const slugs = fs.readdirSync(customersDir).filter((d) => {
      if (input.filter && !d.includes(input.filter)) return false;
      return fs.statSync(path.join(customersDir, d)).isDirectory();
    });

    const allDeals: ForecastDeal[] = [];

    for (const slug of slugs) {
      const pipelinePath = path.join(customersDir, slug, "pipeline.md");
      if (!fs.existsSync(pipelinePath)) continue;

      const { readPipeline } = await import("../../fs/pipeline-writer.js");
      const deals = await readPipeline(dataDir, slug).catch(() => []);

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
          weightedValue: Math.round(value * prob / 100),
        };
        if (deal.close_date !== undefined) forecastDeal.closeDate = deal.close_date;
        allDeals.push(forecastDeal);
      }
    }

    const totalWeightedValue = allDeals.reduce((sum, d) => sum + d.weightedValue, 0);
    const byStage = allDeals.reduce<Record<string, { count: number; weightedValue: number }>>((acc, d) => {
      if (!acc[d.stage]) acc[d.stage] = { count: 0, weightedValue: 0 };
      acc[d.stage]!.count++;
      acc[d.stage]!.weightedValue += d.weightedValue;
      return acc;
    }, {});

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ deals: allDeals, totalWeightedValue, byStage }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2),
      }],
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

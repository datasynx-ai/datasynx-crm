import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readPipelineSync } from "../../fs/pipeline-writer.js";
import { listCustomerSlugs } from "../../fs/customer-dir.js";
import { customerVisibility } from "../../core/rbac.js";
import { getActor } from "../../fs/audit-log.js";
import {
  customerOwnerMap,
  lastAuditActorMap,
  resolveDealOwner,
} from "../../core/forecast-owner.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

interface ForecastDeal {
  slug: string;
  dealName: string;
  stage: string;
  owner: string;
  value?: number | undefined;
  probability?: number | undefined;
  weightedValue: number;
  closeDate?: string | undefined;
}

export async function handleGetPipelineForecast(
  input: { filter?: string; owner?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    // RBAC: a rep only sees their own customers; manager/admin see the full
    // rollup (issue #51). Mirrors list_customers.
    const actor = getActor();
    const canSee = customerVisibility(dataDir, actor);
    const slugs = listCustomerSlugs(dataDir).filter(
      (d) => canSee(d) && (!input.filter || d.includes(input.filter))
    );

    const rbacOwners = customerOwnerMap(dataDir);
    const auditOwners = lastAuditActorMap(dataDir);

    const allDeals: ForecastDeal[] = [];

    for (const slug of slugs) {
      // readPipelineSync already guards a missing file (returns []); no need for
      // a per-iteration existsSync + dynamic import.
      const deals = readPipelineSync(dataDir, slug);

      for (const deal of deals) {
        if (deal.stage === "won" || deal.stage === "lost") continue;
        const owner = resolveDealOwner(deal.owner, slug, rbacOwners, auditOwners);
        if (input.owner && owner !== input.owner) continue;
        const prob = deal.probability ?? 50;
        const value = deal.value ?? 0;
        const forecastDeal: ForecastDeal = {
          slug,
          dealName: deal.name,
          stage: deal.stage,
          owner,
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
    const byOwner = allDeals.reduce<Record<string, { count: number; weightedValue: number }>>(
      (acc, d) => {
        if (!acc[d.owner]) acc[d.owner] = { count: 0, weightedValue: 0 };
        acc[d.owner]!.count++;
        acc[d.owner]!.weightedValue += d.weightedValue;
        return acc;
      },
      {}
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ deals: allDeals, totalWeightedValue, byStage, byOwner }, null, 2),
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
      description: `Aggregate weighted pipeline revenue. Groups open deals by stage AND by owner,
computes probability-weighted expected revenue. RBAC-aware: a rep sees only their own
customers' deals; manager/admin see the full team rollup. Pass owner to drill into one rep.

Returns: { deals: [...], totalWeightedValue, byStage: { stage: { count, weightedValue } }, byOwner: { owner: { count, weightedValue } } }`,
      inputSchema: z.object({
        filter: z.string().optional().describe("Filter by customer slug substring"),
        owner: z.string().optional().describe("Limit the forecast to a single owner/rep"),
      }),
    },
    async ({ filter, owner }) =>
      handleGetPipelineForecast({
        ...(filter !== undefined ? { filter } : {}),
        ...(owner !== undefined ? { owner } : {}),
      })
  );
}

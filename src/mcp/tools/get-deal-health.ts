import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readPipeline } from "../../fs/pipeline-writer.js";
import { readInteractions } from "../../fs/interactions-writer.js";
import { readGraph, getStakeholders } from "../../core/graph.js";
import {
  scoreDealForToday,
  detectTouchSentiment,
  latestTouchSummary,
} from "../../core/deal-health.js";
import type { DealHealthScore } from "../../core/deal-health.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleGetDealHealth(
  input: { slug: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const deals = await readPipeline(dataDir, input.slug);
    const today = new Date();

    // Structural + sentiment context — the same signals open_deal_room uses, so
    // the two tools stay consistent (issue #54). Read once per customer.
    const stakeholders = getStakeholders(readGraph(dataDir, input.slug));
    const hasEconomicBuyer = stakeholders.economicBuyers.length > 0;
    const hasChampion = stakeholders.champions.length > 0;
    const lastSummary = latestTouchSummary(await readInteractions(dataDir, input.slug));
    const lastTouchSentiment = lastSummary ? detectTouchSentiment(lastSummary) : undefined;

    const results: Array<{ deal: string; stage: string } & DealHealthScore> = [];

    for (const deal of deals) {
      const health = scoreDealForToday(deal, today, {
        hasEconomicBuyer,
        hasChampion,
        ...(lastTouchSentiment !== undefined ? { lastTouchSentiment } : {}),
      });

      results.push({ deal: deal.name, stage: deal.stage, ...health });
    }

    return {
      content: [
        { type: "text", text: JSON.stringify({ slug: input.slug, deals: results }, null, 2) },
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

export function registerGetDealHealth(server: McpServer): void {
  server.registerTool(
    "get_deal_health",
    {
      title: "Get Deal Health",
      description: `Score the health of all deals for a customer (0–100, grade A–F).
A weighted blend of signals — NOT recency alone: stakeholder coverage (economic
buyer/champion, 30%), recency (20%), stage dwell (15%), last-touch sentiment
(15%), probability plausibility (10%), close date (10%). Hard rule: no A in
negotiation without an identified economic buyer. Consistent with open_deal_room.

Returns: { slug, deals: [{ deal, stage, score, grade, signals, warnings }] }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
      }),
    },
    async ({ slug }) => handleGetDealHealth({ slug })
  );
}

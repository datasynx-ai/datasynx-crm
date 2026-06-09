import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildSimulationInput,
  runSimulation,
  buildConfidenceMessage,
} from "../../core/revenue-simulation.js";
import { getActor } from "../../fs/audit-log.js";
import { UNASSIGNED_OWNER } from "../../core/forecast-owner.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleSimulateRevenue(
  input: { horizon?: "30d" | "90d" | "quarter" | "year"; iterations?: number; owner?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Rolling 90-day window by default — the calendar quarter silently dropped
    // next-quarter pipeline near quarter-end (#55).
    const horizon = input.horizon ?? "90d";

    // RBAC-aware + optional owner drill-down (issue #51).
    const simInput = await buildSimulationInput(dataDir, horizon, today, [], {
      actor: getActor(),
      ...(input.owner !== undefined ? { owner: input.owner } : {}),
    });
    if (input.iterations !== undefined) simInput.iterations = input.iterations;

    const result = runSimulation(simInput);
    const confidence = buildConfidenceMessage(result, simInput.deals.length);

    // Weighted breakdown per owner (probability-weighted), alongside the total.
    const byOwner = simInput.deals.reduce<Record<string, { count: number; weightedValue: number }>>(
      (acc, d) => {
        const owner = d.owner ?? UNASSIGNED_OWNER;
        if (!acc[owner]) acc[owner] = { count: 0, weightedValue: 0 };
        acc[owner]!.count++;
        acc[owner]!.weightedValue += Math.round((d.value * d.probability) / 100);
        return acc;
      },
      {}
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              forecast: result,
              confidence,
              dealCount: simInput.deals.length,
              includedDeals: simInput.deals.length,
              excludedDeals: simInput.excludedDeals,
              excludedValue: simInput.excludedValue,
              byOwner,
              horizon,
              simulatedAt: new Date().toISOString(),
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
          text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2),
        },
      ],
    };
  }
}

export function registerSimulateRevenue(server: McpServer): void {
  server.registerTool(
    "simulate_revenue",
    {
      title: "Simulate Revenue",
      description: `Monte Carlo pipeline revenue simulation with P10/P50/P90 confidence intervals.

Adjusts deal win probabilities using relationship health scores (D12) and
champion presence (D11). Returns the range of possible quarterly/annual outcomes.

Use this instead of (or alongside) get_pipeline_forecast when you need:
- Uncertainty quantification (not just expected value)
- At-risk revenue identification
- Deal sensitivity analysis ("which deal matters most")
- Month-by-month close distribution

Horizon is a ROLLING window by default ("90d") — the calendar "quarter" used to
silently drop next-quarter pipeline near quarter-end. Deals beyond the horizon
are reported in excludedDeals/excludedValue, never dropped silently.

RBAC-aware: a rep only simulates their own customers' deals; manager/admin get the
full team rollup. Pass owner to drill into one rep. byOwner gives the weighted
breakdown per owner alongside the total Monte Carlo.

Args:
  horizon: "30d" | "90d" (default, rolling) | "quarter" (calendar) | "year"
  iterations: simulation iterations (default: 10000)
  owner: limit the simulation to a single owner/rep (optional)

Returns: { forecast: { p10, p50, p90, expected, stdDev, atRiskRevenue, byCloseMonth, topRisks, sensitivityMap }, confidence, dealCount, includedDeals, excludedDeals: [{ slug, name, stage, value, closeDate }], excludedValue, byOwner: { owner: { count, weightedValue } }, horizon }`,
      inputSchema: z.object({
        horizon: z
          .enum(["30d", "90d", "quarter", "year"])
          .optional()
          .describe('Forecast horizon (default: "90d" rolling window)'),
        iterations: z.number().optional().describe("Monte Carlo iterations (default: 10000)"),
        owner: z.string().optional().describe("Limit the simulation to a single owner/rep"),
      }),
    },
    async ({ horizon, iterations, owner }) =>
      handleSimulateRevenue({
        ...(horizon !== undefined ? { horizon } : {}),
        ...(iterations !== undefined ? { iterations } : {}),
        ...(owner !== undefined ? { owner } : {}),
      })
  );
}

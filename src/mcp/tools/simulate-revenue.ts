import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildSimulationInput,
  runSimulation,
  buildConfidenceMessage,
} from "../../core/revenue-simulation.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleSimulateRevenue(
  input: { horizon?: "30d" | "90d" | "quarter" | "year"; iterations?: number },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Rolling 90-day window by default — the calendar quarter silently dropped
    // next-quarter pipeline near quarter-end (#55).
    const horizon = input.horizon ?? "90d";

    const simInput = await buildSimulationInput(dataDir, horizon, today);
    if (input.iterations !== undefined) simInput.iterations = input.iterations;

    const result = runSimulation(simInput);
    const confidence = buildConfidenceMessage(result, simInput.deals.length);

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

Args:
  horizon: "30d" | "90d" (default, rolling) | "quarter" (calendar) | "year"
  iterations: simulation iterations (default: 10000)

Returns: { forecast: { p10, p50, p90, expected, stdDev, atRiskRevenue, byCloseMonth, topRisks, sensitivityMap }, confidence, dealCount, includedDeals, excludedDeals: [{ slug, name, stage, value, closeDate }], excludedValue, horizon }`,
      inputSchema: z.object({
        horizon: z
          .enum(["30d", "90d", "quarter", "year"])
          .optional()
          .describe('Forecast horizon (default: "90d" rolling window)'),
        iterations: z.number().optional().describe("Monte Carlo iterations (default: 10000)"),
      }),
    },
    async ({ horizon, iterations }) =>
      handleSimulateRevenue({
        ...(horizon !== undefined ? { horizon } : {}),
        ...(iterations !== undefined ? { iterations } : {}),
      })
  );
}

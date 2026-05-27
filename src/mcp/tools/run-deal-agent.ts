import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runDealAgent } from "../../agents/deal-agent.js";

const DATA_DIR = process.cwd();

export async function handleRunDealAgent(
  input: {
    slug: string;
    dealName: string;
    autonomyLevel?: "observe" | "suggest" | "act";
    instruction?: string;
    valueThreshold?: number;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await runDealAgent(
      {
        slug: input.slug,
        dealName: input.dealName,
        autonomyLevel: input.autonomyLevel ?? "suggest",
        valueThreshold: input.valueThreshold ?? 50_000,
        today,
        ...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
      },
      dataDir
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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

export function registerRunDealAgent(server: McpServer): void {
  server.registerTool(
    "run_deal_agent",
    {
      title: "Run Deal Agent",
      description: `Analyzes a specific deal and generates a prioritized action plan.

Three autonomy levels:
- observe: analyze and return plan, no side effects
- suggest (default): queue actions for human review in agent-queue.json
- act: auto-execute actions with confidence ≥ 0.7 and value < valueThreshold

Each action includes confidence score and reasoning (glass-box).
Returns full trace for inspection.

Args:
  slug: Customer slug
  dealName: Exact deal name
  autonomyLevel: "observe" | "suggest" | "act" (default: "suggest")
  instruction: Optional context/question for the agent
  valueThreshold: EUR value above which no auto-execution (default: 50000)

Returns: { assessment, riskLevel, plan[], actionsQueued[], actionsExecuted[], trace }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        dealName: z.string().describe("Exact deal name"),
        autonomyLevel: z
          .enum(["observe", "suggest", "act"])
          .optional()
          .describe("Autonomy level (default: suggest)"),
        instruction: z.string().optional().describe("Optional instruction for the agent"),
        valueThreshold: z
          .number()
          .optional()
          .describe("EUR value above which no auto-execution (default: 50000)"),
      }),
    },
    async ({ slug, dealName, autonomyLevel, instruction, valueThreshold }) =>
      handleRunDealAgent({
        slug,
        dealName,
        ...(autonomyLevel !== undefined ? { autonomyLevel } : {}),
        ...(instruction !== undefined ? { instruction } : {}),
        ...(valueThreshold !== undefined ? { valueThreshold } : {}),
      })
  );
}

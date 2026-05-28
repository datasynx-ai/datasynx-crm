import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildDealRoom } from "../../agents/deal-room.js";

const DATA_DIR = process.cwd();

export async function handleOpenDealRoom(
  input: { slug: string; dealName: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const brief = await buildDealRoom(dataDir, input.slug, input.dealName, today);
    return {
      content: [{ type: "text", text: JSON.stringify(brief, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2) }],
    };
  }
}

export function registerOpenDealRoom(server: McpServer): void {
  server.registerTool(
    "open_deal_room",
    {
      title: "Open Deal Room",
      description: `Multi-agent deal brief: orchestrates relationship graph, health scores, deal health, revenue simulation, and playbook matching into a unified deal-room brief with executive summary, top priorities, and risk score (0–100).

Returns: { slug, dealName, generatedAt, stakeholders, relationshipHealth, dealHealth, revenueSimulation, recommendedPlaybook, executiveSummary, topPriorities, riskScore }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        dealName: z.string().describe("Name of the deal to analyse"),
      }),
    },
    async ({ slug, dealName }) => handleOpenDealRoom({ slug, dealName })
  );
}

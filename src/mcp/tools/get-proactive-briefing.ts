import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildDailyBriefing } from "../../core/proactive-agent.js";

const DATA_DIR = process.cwd();

export async function handleGetProactiveBriefing(
  input: { date?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const date = input.date ?? new Date().toISOString().slice(0, 10);
    const briefing = await buildDailyBriefing(dataDir, date);
    return {
      content: [{ type: "text", text: JSON.stringify(briefing, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2) }],
    };
  }
}

export function registerGetProactiveBriefing(server: McpServer): void {
  server.registerTool(
    "get_proactive_briefing",
    {
      title: "Get Proactive Briefing",
      description: `Generate a proactive daily briefing: urgent alerts (relationship decay, deal risk, overdue close dates), pipeline forecast (P50/P90), and a single top-action recommendation.

Returns: { date, generatedAt, urgent: string[], opportunities: string[], forecast: string, topAction: string }`,
      inputSchema: z.object({
        date: z.string().optional().describe("ISO date (YYYY-MM-DD). Defaults to today."),
      }),
    },
    async ({ date }) =>
      handleGetProactiveBriefing(date ? { date } : {})
  );
}

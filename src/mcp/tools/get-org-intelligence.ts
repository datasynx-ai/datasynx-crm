import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildStakeholderMap } from "../../core/org-intelligence.js";

const DATA_DIR = process.cwd();

export async function handleGetOrgIntelligence(
  input: { slug: string; dealName?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const map = buildStakeholderMap(dataDir, input.slug, today, input.dealName);
    return {
      content: [{ type: "text", text: JSON.stringify(map, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2) }],
    };
  }
}

export function registerGetOrgIntelligence(server: McpServer): void {
  server.registerTool(
    "get_org_intelligence",
    {
      title: "Get Org Intelligence",
      description: `Build a stakeholder map for a customer: champions, economic buyers, blockers, health scores, risk flags, and a prioritised recommendation.

Returns: { slug, updatedAt, people: [{ name, email, role, healthScore, daysSinceContact, contactStrength, riskFlags }], missingRoles, riskAssessment, recommendation }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        dealName: z.string().optional().describe("Optional deal name to scope the analysis"),
      }),
    },
    async ({ slug, dealName }) =>
      handleGetOrgIntelligence(dealName ? { slug, dealName } : { slug })
  );
}

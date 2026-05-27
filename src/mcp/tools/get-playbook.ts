import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listPlaybooks, matchPlaybooks } from "../../core/playbooks.js";
import type { DealSnapshot } from "../../core/revenue-simulation.js";

const DATA_DIR = process.cwd();

export async function handleGetPlaybook(
  input: {
    slug: string;
    stage?: string;
    value?: number;
    healthScore?: number;
    daysSinceContact?: number;
    championPresent?: boolean;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const playbooks = listPlaybooks(dataDir, input.slug);

    const hasDealContext =
      input.stage !== undefined ||
      input.value !== undefined ||
      input.healthScore !== undefined;

    if (!hasDealContext) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            matches: playbooks.map((pb) => ({
              name: pb.name,
              trigger: pb.frontmatter.trigger,
              successRate: pb.frontmatter.successRate,
              usedCount: pb.frontmatter.usedCount,
              lastUpdated: pb.frontmatter.lastUpdated,
              content: pb.content,
            })),
            totalPlaybooks: playbooks.length,
            slug: input.slug,
          }, null, 2),
        }],
      };
    }

    const mockDeal: DealSnapshot = {
      slug: input.slug,
      name: "",
      stage: input.stage ?? "lead",
      value: input.value ?? 0,
      probability: 50,
      healthScore: input.healthScore ?? 60,
      daysSinceContact: input.daysSinceContact ?? 0,
      championPresent: input.championPresent ?? false,
    };

    const matches = matchPlaybooks(playbooks, mockDeal, input.daysSinceContact ?? 0);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          matches: matches.map((m) => ({
            name: m.playbook.name,
            score: m.score,
            matchedConditions: m.matchedConditions,
            trigger: m.playbook.frontmatter.trigger,
            successRate: m.playbook.frontmatter.successRate,
            usedCount: m.playbook.frontmatter.usedCount,
            content: m.playbook.content,
          })),
          totalPlaybooks: playbooks.length,
          slug: input.slug,
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2) }],
    };
  }
}

export function registerGetPlaybook(server: McpServer): void {
  server.registerTool(
    "get_playbook",
    {
      title: "Get Playbook",
      description: `Retrieve playbooks for a customer. With deal context, returns only matching playbooks sorted by success rate. Without deal context, returns all playbooks.

Use after run_deal_agent or before a sales call to get proven guidance for the current situation.

Args:
  slug: Customer ID (required)
  stage: Deal stage (optional — enables trigger matching)
  value: Deal value in euros (optional)
  healthScore: Relationship health score 0–100 (optional)
  daysSinceContact: Days since last contact / days_stalled proxy (optional)
  championPresent: Whether a champion is identified (optional)

Returns: { matches: [{ name, score, trigger, successRate, usedCount, content }], totalPlaybooks, slug }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer ID"),
        stage: z.string().optional().describe("Deal stage"),
        value: z.number().optional().describe("Deal value in euros"),
        healthScore: z.number().optional().describe("Health score 0–100"),
        daysSinceContact: z.number().optional().describe("Days since last contact"),
        championPresent: z.boolean().optional().describe("Champion identified"),
      }),
    },
    async ({ slug, stage, value, healthScore, daysSinceContact, championPresent }) =>
      handleGetPlaybook({
        slug,
        ...(stage !== undefined ? { stage } : {}),
        ...(value !== undefined ? { value } : {}),
        ...(healthScore !== undefined ? { healthScore } : {}),
        ...(daysSinceContact !== undefined ? { daysSinceContact } : {}),
        ...(championPresent !== undefined ? { championPresent } : {}),
      }, DATA_DIR)
  );
}

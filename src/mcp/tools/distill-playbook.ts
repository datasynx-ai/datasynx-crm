import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { distillPlaybook } from "../../core/playbooks.js";
import { callLlm } from "../../core/llm.js";

const DATA_DIR = process.cwd();

export async function handleDistillPlaybook(
  input: { slug: string; dealName: string; outcome: "won" | "lost" },
  dataDir: string = DATA_DIR,
  llmFn: (prompt: string) => Promise<string> = callLlm
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const result = await distillPlaybook(dataDir, input.slug, input.dealName, input.outcome, llmFn);

    if (!result.ok) {
      const error = result.errorKind === "no_interactions"
        ? `No interactions.md found for ${input.slug}`
        : "LLM response could not be parsed as playbook";
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error }, null, 2) }],
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          playbook: {
            name: result.playbook.name,
            trigger: result.playbook.frontmatter.trigger,
            successRate: result.playbook.frontmatter.successRate,
            usedCount: result.playbook.frontmatter.usedCount,
            path: result.playbook.path,
          },
          reasoning: result.reasoning,
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2) }],
    };
  }
}

export function registerDistillPlaybook(server: McpServer): void {
  server.registerTool(
    "distill_playbook",
    {
      title: "Distill Playbook",
      description: `Use LLM to extract a reusable playbook from a won or lost deal's interaction history. Analyzes the customer's interactions.md and identifies the winning/losing pattern as a structured playbook.

Run after every won or lost deal to build your procedural memory library.

Args:
  slug: Customer ID
  dealName: Name of the deal to analyze
  outcome: "won" or "lost"

Returns: { success: true, playbook: { name, trigger, successRate, path }, reasoning }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer ID"),
        dealName: z.string().describe("Deal name to analyze"),
        outcome: z.enum(["won", "lost"]).describe("Deal outcome"),
      }),
    },
    async ({ slug, dealName, outcome }) => handleDistillPlaybook({ slug, dealName, outcome }, DATA_DIR)
  );
}

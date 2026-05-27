import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writePlaybook, playbooksDir, toKebabCase } from "../../core/playbooks.js";
import path from "path";

const DATA_DIR = process.cwd();

export async function handleCreatePlaybook(
  input: {
    slug: string;
    name: string;
    trigger: string;
    content: string;
    successRate?: number;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const name = toKebabCase(input.name);
    const today = new Date().toISOString().slice(0, 10);
    const filePath = path.join(playbooksDir(dataDir, input.slug), `${name}.md`);

    const playbook = {
      slug: input.slug,
      name,
      frontmatter: {
        trigger: input.trigger,
        successRate: input.successRate ?? 0.5,
        usedCount: 0,
        lastUpdated: today,
      },
      content: input.content,
      path: filePath,
    };

    writePlaybook(dataDir, input.slug, playbook);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          playbook: {
            name,
            trigger: input.trigger,
            successRate: playbook.frontmatter.successRate,
            usedCount: 0,
            lastUpdated: today,
            path: filePath,
          },
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2) }],
    };
  }
}

export function registerCreatePlaybook(server: McpServer): void {
  server.registerTool(
    "create_playbook",
    {
      title: "Create Playbook",
      description: `Create or update a playbook for a customer. Playbooks encode proven tactics for specific deal situations.

Trigger DSL uses AND-only conditions:
  deal_stage_<stage> | value > N | value < N | days_stalled > N | health < N | health > N | no_champion | has_champion

Example: "deal_stage_negotiation AND value > 50000 AND days_stalled > 7"

Args:
  slug: Customer ID
  name: Playbook name (auto-converted to kebab-case)
  trigger: Trigger DSL string (conditions separated by AND)
  content: Playbook markdown body (## Situation, ## Steps, ## Warnings, ## Templates)
  successRate: Historical win rate 0.0–1.0 (default: 0.5)

Returns: { success: true, playbook: { name, trigger, successRate, path } }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer ID"),
        name: z.string().describe("Playbook name"),
        trigger: z.string().describe("Trigger DSL string"),
        content: z.string().describe("Playbook markdown body"),
        successRate: z.number().min(0).max(1).optional().describe("Historical win rate 0.0–1.0"),
      }),
    },
    async ({ slug, name, trigger, content, successRate }) =>
      handleCreatePlaybook({
        slug, name, trigger, content,
        ...(successRate !== undefined ? { successRate } : {}),
      }, DATA_DIR)
  );
}

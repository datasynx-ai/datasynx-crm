import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTemplate } from "../../fs/template-store.js";
import { interpolate, buildVariablesFromCustomer } from "../../core/template-engine.js";
import { readMainFacts } from "../../fs/customer-dir.js";

const DATA_DIR = process.cwd();

export async function handleDraftEmail(
  input: { slug: string; templateId: string; overrides?: Record<string, string> },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tmpl = getTemplate(dataDir, input.templateId);
  if (!tmpl) {
    return { content: [{ type: "text", text: JSON.stringify({ error: `Template '${input.templateId}' not found` }) }] };
  }

  const autoVars = await buildVariablesFromCustomer(dataDir, input.slug);
  const vars = { ...autoVars, ...(input.overrides ?? {}) };

  const subject = interpolate(tmpl.subject, vars);
  const body = interpolate(tmpl.body, vars);

  // Try to get email from main_facts for 'to' field
  const facts = await readMainFacts(dataDir, input.slug).catch(() => null);
  const to = facts?.email ?? "";

  return {
    content: [{
      type: "text",
      text: JSON.stringify({ subject, body, to, slug: input.slug, templateId: input.templateId, resolvedVariables: vars }, null, 2),
    }],
  };
}

export function registerDraftEmail(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "draft_email",
    {
      description: `Draft a personalized email for a customer using a stored template.
Variables are auto-filled from the customer's main_facts.md. Override any variable manually.
Returns: { subject, body, to, resolvedVariables } — does NOT send automatically.`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        templateId: z.string().describe("Template ID to use"),
        overrides: z.record(z.string()).optional().describe("Override any template variable (e.g. {firstName: 'Alice'})"),
      }),
    },
    ({ slug, templateId, overrides }) =>
      handleDraftEmail({ slug, templateId, ...(overrides !== undefined ? { overrides } : {}) }, dataDir)
  );
}

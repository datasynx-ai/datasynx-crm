import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface CrmPrompt {
  name: string;
  title: string;
  description: string;
  build: (args: { slug: string }) => string;
}

/**
 * CRM playbook prompts exposed via MCP `prompts/list` + `prompts/get`.
 * Each renders an actionable, tool-referencing instruction for the host LLM —
 * the agent-native equivalent of a Salesforce "playbook".
 */
export const CRM_PROMPTS: CrmPrompt[] = [
  {
    name: "deal_risk_review",
    title: "Assess deal risk",
    description:
      "Evaluate the health and risk of a customer's open deals and recommend next steps.",
    build: ({ slug }) =>
      `Assess the deal risk for customer "${slug}".\n` +
      `1. Call open_deal_room({ slug: "${slug}" }) for a consolidated brief, or get_customer_context + get_deal_health.\n` +
      `2. Identify stalled deals, approaching close dates, and silent champions (get_relationship_health).\n` +
      `3. Summarise the top risks and recommend concrete next actions. Do not invent data — cite what you read.`,
  },
  {
    name: "draft_follow_up",
    title: "Draft a follow-up email",
    description:
      "Draft a personalized follow-up email for a customer based on recent interactions.",
    build: ({ slug }) =>
      `Draft a follow-up email for customer "${slug}".\n` +
      `1. Read recent context with get_customer_context({ slug: "${slug}" }).\n` +
      `2. Use draft_email({ slug: "${slug}", templateId, tone: "friendly" }) with an appropriate template.\n` +
      `3. Reference the latest interaction concretely; keep it concise. Return the draft for review — do not send.`,
  },
  {
    name: "account_brief",
    title: "Create an account brief",
    description: "Produce a concise executive brief for a customer account.",
    build: ({ slug }) =>
      `Create an executive account brief for "${slug}".\n` +
      `1. get_customer_context({ slug: "${slug}" }) and get_org_intelligence({ slug: "${slug}" }).\n` +
      `2. Summarise: who the stakeholders are (champions/buyers/blockers), open pipeline, health, and risks.\n` +
      `3. End with the single most important next action.`,
  },
  {
    name: "pipeline_summary",
    title: "Summarize the pipeline",
    description: "Summarize pipeline and forecast, optionally focused on one customer.",
    build: ({ slug }) =>
      `Summarize the sales pipeline (focus customer: "${slug}").\n` +
      `1. get_pipeline_forecast() for the weighted total and per-stage breakdown.\n` +
      `2. simulate_revenue() for P10/P50/P90 if a probabilistic view helps.\n` +
      `3. Highlight at-risk revenue and the deals that most move the forecast.`,
  },
];

export function registerPrompts(server: McpServer): void {
  for (const prompt of CRM_PROMPTS) {
    server.registerPrompt(
      prompt.name,
      {
        title: prompt.title,
        description: prompt.description,
        argsSchema: { slug: z.string().describe("Customer slug") },
      },
      ({ slug }) => ({
        messages: [{ role: "user", content: { type: "text", text: prompt.build({ slug }) } }],
      })
    );
  }
}

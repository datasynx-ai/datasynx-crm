import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTemplate } from "../../fs/template-store.js";
import { interpolate, buildVariablesFromCustomer } from "../../core/template-engine.js";
import { readMainFacts } from "../../fs/customer-dir.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleDraftEmail(
  input: {
    slug: string;
    templateId: string;
    overrides?: Record<string, string>;
    tone?: string;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tmpl = getTemplate(dataDir, input.templateId);
  if (!tmpl) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: `Template '${input.templateId}' not found` }),
        },
      ],
    };
  }

  const autoVars = await buildVariablesFromCustomer(dataDir, input.slug);
  const vars = { ...autoVars, ...(input.overrides ?? {}) };

  const subject = interpolate(tmpl.subject, vars);
  const interpolatedBody = interpolate(tmpl.body, vars);

  // Tone: explicit override wins; otherwise fall back to the customer's tone
  // profile (D8), then the global default.
  let effectiveTone = input.tone;
  if (!effectiveTone) {
    const { resolveTone, toneInstruction } = await import("../../core/tone.js");
    const instr = toneInstruction(resolveTone(dataDir, input.slug));
    if (instr) effectiveTone = instr;
  }

  // Optional LLM polish: rewrite the interpolated body in the requested tone.
  // Falls back to the plain interpolation when no ANTHROPIC_API_KEY is set or
  // the call fails — the template-fill behaviour is always preserved.
  let body = interpolatedBody;
  let polished = false;
  if (effectiveTone) {
    try {
      const { callLlm } = await import("../../core/llm.js");
      const refined = await callLlm(
        `Rewrite the following email in a ${effectiveTone} tone. Keep the same language, ` +
          `preserve all names and facts, and do not invent details. ` +
          `Return ONLY the rewritten email body, no preamble.\n\n---\n${interpolatedBody}`
      );
      if (refined && refined.trim()) {
        // EU-AI-Act Art. 50 (D17): label AI-generated content (opt-out).
        const { labelAiContent } = await import("../../core/compliance.js");
        body = labelAiContent(refined.trim());
        polished = true;
      }
    } catch {
      // graceful fallback to the interpolated body
    }
  }

  // Try to get email from main_facts for 'to' field
  const facts = await readMainFacts(dataDir, input.slug).catch(() => null);
  const to = facts?.email ?? "";

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            subject,
            body,
            to,
            slug: input.slug,
            templateId: input.templateId,
            tone: effectiveTone ?? null,
            polished,
            resolvedVariables: vars,
          },
          null,
          2
        ),
      },
    ],
  };
}

export function registerDraftEmail(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "draft_email",
    {
      description: `Draft a personalized email for a customer using a stored template.
Variables are auto-filled from the customer's main_facts.md. Override any variable manually.
Optionally pass a tone (e.g. "formal", "friendly", "concise") to LLM-polish the body —
falls back to plain template-fill when no ANTHROPIC_API_KEY is configured.
Returns: { subject, body, to, tone, polished, resolvedVariables } — does NOT send automatically.`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        templateId: z.string().describe("Template ID to use"),
        overrides: z
          .record(z.string())
          .optional()
          .describe("Override any template variable (e.g. {firstName: 'Alice'})"),
        tone: z
          .string()
          .optional()
          .describe("Optional tone to LLM-polish the body (e.g. 'formal', 'friendly', 'concise')"),
      }),
    },
    ({ slug, templateId, overrides, tone }) =>
      handleDraftEmail(
        {
          slug,
          templateId,
          ...(overrides !== undefined ? { overrides } : {}),
          ...(tone !== undefined ? { tone } : {}),
        },
        dataDir
      )
  );
}

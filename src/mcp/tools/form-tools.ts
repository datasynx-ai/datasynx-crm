import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createForm, listForms, renderEmbedSnippet } from "../../core/forms.js";
import { enforceRbac } from "../../core/rbac.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

function ok(obj: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

export async function handleCreateForm(
  input: {
    id: string;
    name: string;
    fields: Record<string, string>;
    doubleOptIn?: boolean;
    redirectUrl?: string;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    enforceRbac(dataDir, "create_form");
    const form = createForm(dataDir, {
      id: input.id,
      name: input.name,
      fields: input.fields,
      ...(input.doubleOptIn !== undefined ? { doubleOptIn: input.doubleOptIn } : {}),
      ...(input.redirectUrl !== undefined ? { redirectUrl: input.redirectUrl } : {}),
    });
    const base = (process.env["DXCRM_SERVER_URL"] ?? "http://localhost:3847").replace(/\/+$/, "");
    return ok({ success: true, form, embedSnippet: renderEmbedSnippet(form, base) });
  } catch (err) {
    return ok({ success: false, error: (err as Error).message });
  }
}

export function registerCreateForm(server: McpServer): void {
  server.registerTool(
    "create_form",
    {
      title: "Create Form",
      description: `Create an inbound lead-capture web form (#60): submissions POST to
/forms/:id, auto-create customer + contact + a first interaction and fire the
lead.captured event (workflow-engine ready). Field mapping is configurable
(form field → name|email|company|phone|message). Spam protection: honeypot +
per-IP rate limit. Optional GDPR double-opt-in (lead only created after the
signed confirmation link is clicked). Returns the embeddable HTML snippet.

Returns: { success, form, embedSnippet }`,
      inputSchema: z.object({
        id: z.string().describe("Form id (lowercase, hyphens)"),
        name: z.string().describe("Display name"),
        fields: z
          .record(z.string(), z.string())
          .describe(
            'Mapping form field → CRM field, e.g. {"work_email":"email","company":"company"}'
          ),
        doubleOptIn: z.boolean().optional().describe("Require email confirmation (GDPR)"),
        redirectUrl: z.string().optional().describe("Redirect after successful submit"),
      }),
    },
    async (input) =>
      handleCreateForm({
        id: input.id,
        name: input.name,
        fields: input.fields as Record<string, string>,
        ...(input.doubleOptIn !== undefined ? { doubleOptIn: input.doubleOptIn } : {}),
        ...(input.redirectUrl !== undefined ? { redirectUrl: input.redirectUrl } : {}),
      })
  );
}

export async function handleListForms(
  _input: Record<string, never>,
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const forms = listForms(dataDir);
  return ok({ count: forms.length, forms });
}

export function registerListForms(server: McpServer): void {
  server.registerTool(
    "list_forms",
    {
      title: "List Forms",
      description: `List all inbound lead-capture forms (#60).

Returns: { count, forms }`,
      inputSchema: z.object({}),
    },
    async () => handleListForms({})
  );
}

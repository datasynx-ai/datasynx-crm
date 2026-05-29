import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTemplate } from "../../fs/template-store.js";
import { extractVariables } from "../../core/template-engine.js";

const DATA_DIR = process.cwd();

export async function handleGetEmailTemplate(
  input: { id: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tmpl = getTemplate(dataDir, input.id);
  if (!tmpl) {
    return { content: [{ type: "text", text: JSON.stringify({ error: `Template '${input.id}' not found` }) }] };
  }
  const allVars = extractVariables(`${tmpl.subject}\n${tmpl.body}`);
  const unique = [...new Set(allVars)];
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ ...tmpl, detectedVariables: unique }, null, 2),
    }],
  };
}

export function registerGetEmailTemplate(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "get_email_template",
    {
      description: "Get a specific email template by ID, including its body and detected variables.",
      inputSchema: z.object({
        id: z.string().describe("Template ID (e.g. 'enterprise-intro')"),
      }),
    },
    ({ id }) => handleGetEmailTemplate({ id }, dataDir)
  );
}

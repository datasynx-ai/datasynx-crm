import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readPipeline } from "../../fs/pipeline-writer.js";
import { enforceRbac } from "../../core/rbac.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

function countInteractions(content: string): number {
  // Count ## YYYY-MM-DD headings
  const matches = content.match(/^## \d{4}-\d{2}-\d{2}/gm);
  return matches ? matches.length : 0;
}

export async function handleExportCustomer(
  input: { slug: string; format?: "json" | "markdown"; includeAttachmentContent?: boolean },
  dataDir: string = DATA_DIR
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  enforceRbac(dataDir, "export_customer");

  const customerDir = path.join(dataDir, "customers", input.slug);

  if (!fs.existsSync(customerDir)) {
    return {
      content: [
        {
          type: "text",
          text: `Error: Customer '${input.slug}' not found. Check 'list_customers()' for available customers.`,
        },
      ],
      isError: true,
    };
  }

  const format = input.format ?? "json";

  // Read main_facts.md
  const mainFactsPath = path.join(customerDir, "main_facts.md");
  let mainFacts: Record<string, unknown> = {};
  let mainFactsContent = "";
  if (fs.existsSync(mainFactsPath)) {
    const raw = matter(fs.readFileSync(mainFactsPath, "utf-8") as string);
    mainFacts = raw.data as Record<string, unknown>;
    mainFactsContent = raw.content ?? "";
  }

  // Read interactions
  const interactionsPath = path.join(customerDir, "interactions.md");
  let interactionsContent = "";
  let interactionsCount = 0;
  if (fs.existsSync(interactionsPath)) {
    interactionsContent = fs.readFileSync(interactionsPath, "utf-8") as string;
    interactionsCount = countInteractions(interactionsContent);
  }

  // Read pipeline
  const pipeline = await readPipeline(dataDir, input.slug);

  // Read attachments list, separating converted Markdown from raw files.
  const includeAttachmentContent = input.includeAttachmentContent ?? false;
  const attachmentsDir = path.join(customerDir, "attachments");
  const attachments: string[] = [];
  const attachmentContents: Record<string, string> = {};
  if (fs.existsSync(attachmentsDir)) {
    try {
      const files = fs.readdirSync(attachmentsDir) as string[];
      for (const f of files) {
        try {
          if (!fs.statSync(path.join(attachmentsDir, f)).isFile()) continue;
          attachments.push(f);
          if (includeAttachmentContent && f.endsWith(".md")) {
            attachmentContents[f] = fs.readFileSync(path.join(attachmentsDir, f), "utf-8") as string;
          }
        } catch {
          /* skip */
        }
      }
    } catch {
      /* skip */
    }
  }
  const attachmentContentSection = (): string[] => {
    const entries = Object.entries(attachmentContents);
    if (!includeAttachmentContent || entries.length === 0) return [];
    return [
      "",
      `## Attachment Contents (${entries.length})`,
      ...entries.map(([name, content]) => `\n### ${name}\n\n${content.trim()}`),
    ];
  };

  if (format === "markdown") {
    const markdown = [
      `# Export: ${input.slug}`,
      "",
      "## Main Facts",
      mainFactsContent.trim() || "(no content)",
      "",
      "## Metadata",
      Object.entries(mainFacts)
        .map(([k, v]) => `- **${k}**: ${JSON.stringify(v)}`)
        .join("\n") || "(no metadata)",
      "",
      `## Interactions (${interactionsCount} total)`,
      interactionsContent.trim() || "(no interactions)",
      "",
      "## Pipeline",
      pipeline.length > 0
        ? pipeline
            .map(
              (d) =>
                `- **${d.name}** · ${d.stage}${d.value !== undefined ? ` · €${d.value}` : ""}${d.close_date ? ` · close: ${d.close_date}` : ""}`
            )
            .join("\n")
        : "(no deals)",
      "",
      `## Attachments (${attachments.length})`,
      attachments.length > 0 ? attachments.map((f) => `- ${f}`).join("\n") : "(none)",
      ...attachmentContentSection(),
    ].join("\n");

    return {
      content: [{ type: "text", text: markdown }],
    };
  }

  // Default: JSON
  const exported = {
    slug: input.slug,
    exportedAt: new Date().toISOString(),
    mainFacts,
    interactionsCount,
    pipeline,
    attachments,
    ...(includeAttachmentContent ? { attachmentContents } : {}),
  };

  return {
    content: [{ type: "text", text: JSON.stringify(exported, null, 2) }],
  };
}

export function registerExportCustomer(server: McpServer): void {
  server.registerTool(
    "export_customer",
    {
      title: "Export Customer",
      description: `Export all customer data (main_facts + interactions + pipeline deals + attachments).
Useful for reporting, audits, handoffs, or creating a complete sendable bundle
of every conversation and document for a customer.

Args:
  slug: Customer ID (e.g. "acme-corp")
  format: Output format — "json" (default) or "markdown"
  includeAttachmentContent: Inline the converted Markdown of every attachment
    (default false). Use this to produce a single self-contained bundle.

Returns:
  JSON: { slug, exportedAt, mainFacts, interactionsCount, pipeline, attachments[, attachmentContents] }
  Markdown: Formatted document with all sections (and attachment contents when requested)`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug (e.g. 'acme-corp')"),
        format: z
          .enum(["json", "markdown"])
          .optional()
          .describe("Output format: 'json' (default) or 'markdown'"),
        includeAttachmentContent: z
          .boolean()
          .optional()
          .describe("Inline converted attachment Markdown into the export (default false)"),
      }),
    },
    async ({ slug, format, includeAttachmentContent }) =>
      handleExportCustomer({
        slug,
        ...(format !== undefined ? { format } : {}),
        ...(includeAttachmentContent !== undefined ? { includeAttachmentContent } : {}),
      })
  );
}

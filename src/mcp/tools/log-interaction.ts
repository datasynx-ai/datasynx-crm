import path from "path";
import fs from "fs";
import matter from "gray-matter";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { appendInteraction, formatInteractionEntry } from "../../fs/interactions-writer.js";
import { writeFileAtomic } from "../../fs/atomic-write.js";
import type { InteractionEntry } from "../../schemas/interaction.js";
import { writeAuditEntry, getActor } from "../../fs/audit-log.js";
import { enforceRbac } from "../../core/rbac.js";
import { updateGraphFromInteraction } from "../../core/graph-extractor.js";
import { updateHealthFromInteraction } from "../../core/relationship-health.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleLogInteraction(
  input: {
    slug: string;
    type: InteractionEntry["type"];
    summary: string;
    with: string;
    nextSteps?: string[];
    direction?: "inbound" | "outbound";
    source?: string;
    date?: string;
  },
  dataDir: string = DATA_DIR
): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const today = new Date().toISOString().split("T")[0] as string;
  const interactionDate = input.date ?? today;
  const sourceRef = input.source ?? `agent://log/${Date.now()}`;

  const entry: InteractionEntry = {
    date: interactionDate,
    type: input.type,
    with: input.with,
    summary: input.summary,
    nextSteps: input.nextSteps ?? [],
    sourceRef,
    synced: new Date().toISOString(),
    ...(input.direction !== undefined ? { direction: input.direction } : {}),
  };

  const interactionsPath = path.join(dataDir, "customers", input.slug, "interactions.md");
  const entryText = formatInteractionEntry(entry);

  try {
    enforceRbac(dataDir, "log_interaction");

    await appendInteraction(dataDir, input.slug, entry);

    // Graph auto-update: fire-and-forget
    updateGraphFromInteraction(dataDir, input.slug, {
      withStr: input.with,
      interactionDate: interactionDate,
    }).catch(() => {
      // non-critical — interaction already written
    });

    // Health auto-update: fire-and-forget (runs after graph update)
    updateHealthFromInteraction(dataDir, input.slug).catch(() => {
      // non-critical — interaction already written
    });

    // Update last_touchpoint in main_facts.md
    const mainFactsPath = path.join(dataDir, "customers", input.slug, "main_facts.md");
    if (fs.existsSync(mainFactsPath)) {
      try {
        const raw = matter(fs.readFileSync(mainFactsPath, "utf-8"));
        raw.data.last_touchpoint = interactionDate;
        // js-yaml quotes YYYY-MM-DD strings; strip quotes to keep plain date format
        let serialized = matter.stringify(raw.content, raw.data);
        serialized = serialized.replace(
          /^(last_touchpoint:\s*)['"](\d{4}-\d{2}-\d{2})['"]/m,
          "$1$2"
        );
        writeFileAtomic(mainFactsPath, serialized);
      } catch {
        // non-critical — interaction is already written
      }
    }

    writeAuditEntry(dataDir, {
      timestamp: new Date().toISOString(),
      actor: getActor(),
      tool: "log_interaction",
      slug: input.slug,
      summary: input.summary,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              path: interactionsPath,
              entry: entryText,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: (err as Error).message,
            },
            null,
            2
          ),
        },
      ],
    };
  }
}

export function registerLogInteraction(server: McpServer): void {
  server.registerTool(
    "log_interaction",
    {
      title: "Log Interaction",
      description: `Write a new interaction entry to the CRM. Use after every call, meeting, or email.
Format matches auto-synced entries exactly — immediately searchable.

Args:
  slug: Customer ID
  type: Interaction type ("Email" | "Call" | "Meeting" | "Note" | "Demo" | "Proposal" | "Contract" | "Other")
  summary: 2-5 sentences describing what happened (min 1 char)
  with: Who was involved (name or email address)
  nextSteps: Array of action items (optional)
  direction: "inbound" or "outbound" (optional)
  source: Source reference string (optional, auto-generated if omitted)

Returns: { success: boolean, path: string, entry: string }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug (e.g. 'acme-corp')"),
        type: z
          .enum(["Email", "Call", "Meeting", "Note", "Demo", "Proposal", "Contract", "Other"])
          .describe("Type of interaction"),
        summary: z.string().min(1).describe("2-5 sentence summary of what happened"),
        with: z.string().describe("Who was involved (name or email)"),
        nextSteps: z.array(z.string()).optional().describe("Action items for follow-up"),
        direction: z
          .enum(["inbound", "outbound"])
          .optional()
          .describe("Direction of communication"),
        source: z
          .string()
          .optional()
          .describe("Source reference (e.g. gmail://thread/123). Auto-generated if omitted."),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Date of interaction (YYYY-MM-DD). Defaults to today."),
      }),
    },
    async ({ slug, type, summary, with: withStr, nextSteps, direction, source, date }) =>
      handleLogInteraction({
        slug,
        type,
        summary,
        with: withStr,
        ...(nextSteps !== undefined ? { nextSteps } : {}),
        ...(direction !== undefined ? { direction } : {}),
        ...(source !== undefined ? { source } : {}),
        ...(date !== undefined ? { date } : {}),
      })
  );
}

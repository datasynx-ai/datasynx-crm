import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { appendInteraction } from "../../fs/interactions-writer.js";
import { writeAuditEntry, getActor } from "../../fs/audit-log.js";

const DATA_DIR = process.cwd();

export async function handleSummarizeMeeting(
  input: {
    slug: string;
    transcript: string;
    with?: string;
    date?: string;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    let summary = input.transcript.slice(0, 400);
    let nextSteps: string[] = [];

    try {
      const { callLlm } = await import("../../core/llm.js");
      const prompt = `Summarize this meeting transcript in 3-5 sentences and extract action items.\n\nTranscript:\n${input.transcript.slice(0, 3000)}\n\nRespond as JSON: { "summary": "...", "nextSteps": ["..."] }`;
      const response = await callLlm(prompt);
      const parsed = JSON.parse(response) as { summary?: string; nextSteps?: string[] };
      summary = parsed.summary ?? summary;
      nextSteps = parsed.nextSteps ?? [];
    } catch {
      // LLM unavailable — use raw transcript slice
    }

    const date = input.date ?? new Date().toISOString().slice(0, 10);
    const sourceRef = `agent://meeting/${Date.now()}`;

    await appendInteraction(dataDir, input.slug, {
      date,
      type: "Meeting",
      with: input.with ?? "Meeting Participant",
      summary,
      nextSteps,
      sourceRef,
      synced: new Date().toISOString(),
    });

    writeAuditEntry(dataDir, {
      timestamp: new Date().toISOString(),
      actor: getActor(),
      tool: "summarize_meeting",
      slug: input.slug,
      summary: summary.slice(0, 100),
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, summary, nextSteps, sourceRef }, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2) }],
    };
  }
}

export function registerSummarizeMeeting(server: McpServer): void {
  server.registerTool(
    "summarize_meeting",
    {
      title: "Summarize Meeting",
      description: `Summarize a meeting transcript and log it as an interaction. Uses LLM to extract key points and action items (falls back to raw text slice if LLM unavailable).

Args:
  slug: Customer ID
  transcript: Full meeting transcript text
  with: Participant name(s) (optional)
  date: Meeting date YYYY-MM-DD (optional, defaults to today)

Returns: { success, summary, nextSteps, sourceRef }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        transcript: z.string().min(1).describe("Full meeting transcript"),
        with: z.string().optional().describe("Participant names"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Meeting date"),
      }),
    },
    async ({ slug, transcript, with: withStr, date }) =>
      handleSummarizeMeeting({
        slug,
        transcript,
        ...(withStr !== undefined ? { with: withStr } : {}),
        ...(date !== undefined ? { date } : {}),
      })
  );
}

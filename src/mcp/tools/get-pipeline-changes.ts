import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { diffAgainstNow } from "../../core/snapshots.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export async function handleGetPipelineChanges(
  input: { since?: string; days?: number },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const since = input.since ?? daysAgoIso(input.days ?? 7);
  const diff = diffAgainstNow(dataDir, since);
  const payload = diff
    ? diff
    : {
        error: `No pipeline snapshot at or before ${since}. Snapshots accrue daily via the daemon.`,
      };
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

export function registerGetPipelineChanges(server: McpServer): void {
  server.registerTool(
    "get_pipeline_changes",
    {
      title: "Get Pipeline Changes",
      description: `Pipeline time-travel: what changed in the pipeline since a baseline date.
Compares the live pipeline against the most recent daily snapshot at/before the
baseline. Answers "what moved since last week?", "what did we win/lose?".

Args:
  since: Baseline date YYYY-MM-DD (optional)
  days: Look back this many days instead of a date (default 7)

Returns: { fromId, toId, added[], removed[], advanced[{from,to}], won[], lost[],
valueChanged[{from,to}], openValueBefore, openValueAfter, openValueDelta }
or { error } when no baseline snapshot exists yet.`,
      inputSchema: z.object({
        since: z.string().optional().describe("Baseline date YYYY-MM-DD"),
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe("Look-back window in days (default 7)"),
      }),
    },
    async ({ since, days }) => {
      const input: { since?: string; days?: number } = {};
      if (since !== undefined) input.since = since;
      if (days !== undefined) input.days = days;
      return handleGetPipelineChanges(input);
    }
  );
}

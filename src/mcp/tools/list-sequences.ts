import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listSequences, readEnrollments } from "../../fs/sequence-store.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleListSequences(
  _input: Record<string, never>,
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const sequences = listSequences(dataDir);
  const enrollments = readEnrollments(dataDir);

  const result = sequences.map((seq) => ({
    id: seq.id,
    name: seq.name,
    stepCount: seq.steps.length,
    enrollmentCount: enrollments.filter((e) => e.sequenceId === seq.id).length,
    ...(seq.starter ? { starter: true } : {}),
  }));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ sequences: result }, null, 2),
      },
    ],
  };
}

export function registerListSequences(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "list_sequences",
    {
      description: `List all email sequences with step count and enrollment count.
Returns: { sequences: Array<{ id, name, stepCount, enrollmentCount }> }`,
      inputSchema: z.object({}),
    },
    () => handleListSequences({}, dataDir)
  );
}

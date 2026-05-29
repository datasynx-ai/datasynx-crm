import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readEnrollments } from "../../fs/sequence-store.js";
import type { SequenceEnrollment } from "../../schemas/sequence.js";

const DATA_DIR = process.cwd();

export async function handleListSequenceEnrollments(
  input: { slug?: string; status?: "active" | "paused" | "completed" },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  let enrollments = readEnrollments(dataDir);

  if (input.slug !== undefined) {
    enrollments = enrollments.filter((e: SequenceEnrollment) => e.slug === input.slug);
  }

  if (input.status !== undefined) {
    enrollments = enrollments.filter((e: SequenceEnrollment) => e.status === input.status);
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({ enrollments }, null, 2),
    }],
  };
}

export function registerListSequenceEnrollments(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "list_sequence_enrollments",
    {
      description: `List email sequence enrollments. Filter by customer slug or status.
Returns: { enrollments: SequenceEnrollment[] }`,
      inputSchema: z.object({
        slug: z.string().optional().describe("Filter by customer slug"),
        status: z.enum(["active", "paused", "completed"]).optional().describe("Filter by enrollment status"),
      }),
    },
    ({ slug, status }) =>
      handleListSequenceEnrollments(
        {
          ...(slug !== undefined ? { slug } : {}),
          ...(status !== undefined ? { status } : {}),
        },
        dataDir
      )
  );
}

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { updateEnrollment } from "../../fs/sequence-store.js";

const DATA_DIR = process.cwd();

export async function handleUnenrollFromSequence(
  input: { enrollmentId: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const updated = await updateEnrollment(dataDir, input.enrollmentId, { status: "paused" });

  if (!updated) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: false, error: `Enrollment '${input.enrollmentId}' not found` }),
      }],
    };
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({ success: true }),
    }],
  };
}

export function registerUnenrollFromSequence(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "unenroll_from_sequence",
    {
      description: `Unenroll (pause) a contact from an email sequence. Sets status to "paused" (soft delete).
Returns: { success: boolean }`,
      inputSchema: z.object({
        enrollmentId: z.string().describe("ID of the enrollment to pause"),
      }),
    },
    ({ enrollmentId }) =>
      handleUnenrollFromSequence({ enrollmentId }, dataDir)
  );
}

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSequence, writeEnrollment, readEnrollments } from "../../fs/sequence-store.js";
import { getTemplate } from "../../fs/template-store.js";

const DATA_DIR = process.cwd();

export async function handleEnrollInSequence(
  input: { slug: string; contactEmail: string; sequenceId: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const sequence = getSequence(dataDir, input.sequenceId);
  if (!sequence) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: `Sequence '${input.sequenceId}' not found` }),
      }],
    };
  }

  // Validate that the first step's template exists
  const firstStep = sequence.steps[0]!;
  const template = getTemplate(dataDir, firstStep.templateId);
  if (!template) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: `Template '${firstStep.templateId}' for step 0 not found` }),
      }],
    };
  }

  const enrollmentId = `enroll_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const now = new Date().toISOString();

  const enrollment = {
    id: enrollmentId,
    sequenceId: input.sequenceId,
    slug: input.slug,
    contactEmail: input.contactEmail,
    enrolledAt: now,
    status: "active" as const,
    currentStep: 0,
    stepsCompleted: [] as number[],
  };

  await writeEnrollment(dataDir, enrollment);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        enrollmentId,
        sequenceName: sequence.name,
        totalSteps: sequence.steps.length,
      }),
    }],
  };
}

export function registerEnrollInSequence(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "enroll_in_sequence",
    {
      description: `Enroll a contact in an email sequence. Validates that the sequence and its first template exist.
Returns: { enrollmentId, sequenceName, totalSteps }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        contactEmail: z.string().email().describe("Email address of the contact to enroll"),
        sequenceId: z.string().describe("ID of the sequence to enroll in"),
      }),
    },
    ({ slug, contactEmail, sequenceId }) =>
      handleEnrollInSequence({ slug, contactEmail, sequenceId }, dataDir)
  );
}

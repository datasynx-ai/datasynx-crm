import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSurvey, generateSurveyToken, buildSurveyEmail, savePendingSurvey } from "../../core/survey-engine.js";

const DATA_DIR = process.cwd();

export async function handleSendNpsSurvey(
  input: { slug: string; contactEmail: string; surveyId: string; serverUrl?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const survey = getSurvey(dataDir, input.surveyId);
  if (!survey) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: `Survey '${input.surveyId}' not found` }) }],
    };
  }

  const serverUrl = input.serverUrl ?? process.env["DXCRM_SERVER_URL"] ?? "http://localhost:3456";
  const token = generateSurveyToken(input.slug, input.contactEmail, input.surveyId);
  const email = buildSurveyEmail(survey, serverUrl, token);

  await savePendingSurvey(dataDir, input.surveyId, input.slug, input.contactEmail, token);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        token,
        subject: email.subject,
        body: email.body,
        surveyUrl: `${serverUrl}/survey/respond?token=${token}`,
        note: "Email draft ready. Use draft_email or Gmail to send.",
      }, null, 2),
    }],
  };
}

export function registerSendNpsSurvey(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "send_nps_survey",
    {
      description: `Generate an NPS/CSAT survey email for a customer contact. Returns subject, HTML body, and a token-based response URL.
Does NOT send automatically — returns draft for review.
Returns: { token, subject, body, surveyUrl }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug"),
        contactEmail: z.string().email().describe("Contact email to send survey to"),
        surveyId: z.string().describe("Survey definition ID from .agentic/surveys/"),
        serverUrl: z.string().optional().describe("Server URL for response links (default: DXCRM_SERVER_URL env var or localhost:3456)"),
      }),
    },
    ({ slug, contactEmail, surveyId, serverUrl }) =>
      handleSendNpsSurvey(
        {
          slug,
          contactEmail,
          surveyId,
          ...(serverUrl !== undefined ? { serverUrl } : {}),
        },
        dataDir
      )
  );
}

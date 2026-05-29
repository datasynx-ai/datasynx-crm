import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadSurveyResponses, calcNpsScore } from "../../core/survey-engine.js";

const DATA_DIR = process.cwd();

export async function handleGetSurveyResults(
  input: { surveyId: string; slug?: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const responses = loadSurveyResponses(dataDir, input.surveyId, input.slug);
  const nps = calcNpsScore(responses);
  const promoters = responses.filter((r) => r.score >= 9).length;
  const passives = responses.filter((r) => r.score >= 7 && r.score <= 8).length;
  const detractors = responses.filter((r) => r.score <= 6).length;

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        surveyId: input.surveyId,
        ...(input.slug ? { slug: input.slug } : {}),
        totalResponses: responses.length,
        npsScore: nps,
        promoters,
        passives,
        detractors,
        responses: responses.map((r) => ({
          slug: r.slug,
          email: r.contactEmail,
          score: r.score,
          ...(r.comment ? { comment: r.comment } : {}),
          respondedAt: r.respondedAt,
        })),
      }, null, 2),
    }],
  };
}

export function registerGetSurveyResults(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "get_survey_results",
    {
      description: `Get NPS/CSAT survey results with score breakdown. Calculates Net Promoter Score.
Returns: { npsScore, totalResponses, promoters, passives, detractors, responses[] }`,
      inputSchema: z.object({
        surveyId: z.string().describe("Survey ID"),
        slug: z.string().optional().describe("Filter results to a specific customer"),
      }),
    },
    ({ surveyId, slug }) =>
      handleGetSurveyResults(
        {
          surveyId,
          ...(slug !== undefined ? { slug } : {}),
        },
        dataDir
      )
  );
}

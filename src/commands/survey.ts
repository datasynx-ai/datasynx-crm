import { Command } from "commander";
import { success, error, info, bold } from "../ui/colors.js";
import { getSurvey, writeSurvey, loadSurveyResponses, calcNpsScore, generateSurveyToken, savePendingSurvey } from "../core/survey-engine.js";
import type { SurveyDefinition } from "../schemas/survey.js";

export const surveyCommand = new Command("survey").description("Manage NPS/CSAT surveys");

surveyCommand
  .command("create <id>")
  .description("Create a new survey definition")
  .option("--type <type>", "Survey type: nps|csat|ces", "nps")
  .option("--question <q>", "Survey question")
  .action((id: string, opts: { type: string; question?: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const survey: SurveyDefinition = {
      id,
      type: (opts.type as SurveyDefinition["type"]) ?? "nps",
      question: opts.question ?? "How likely are you to recommend us? (0–10)",
      scale: { min: 0, max: 10 },
      includeComment: true,
      commentPrompt: "What's the main reason for your score?",
      createdAt: new Date().toISOString(),
    };
    writeSurvey(dataDir, survey);
    console.log(success(`✓ Survey '${id}' created`));
  });

surveyCommand
  .command("send <surveyId>")
  .description("Generate survey token for a contact")
  .requiredOption("--slug <slug>", "Customer slug")
  .requiredOption("--email <email>", "Contact email")
  .option("--server <url>", "Server URL", process.env["DXCRM_SERVER_URL"] ?? "http://localhost:3456")
  .action(async (surveyId: string, opts: { slug: string; email: string; server: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const survey = getSurvey(dataDir, surveyId);
    if (!survey) {
      console.error(error(`Survey '${surveyId}' not found`));
      process.exit(1);
    }
    const token = generateSurveyToken(opts.slug, opts.email, surveyId);
    await savePendingSurvey(dataDir, surveyId, opts.slug, opts.email, token);
    console.log(success(`✓ Survey token generated`));
    console.log(info(`  URL: ${opts.server}/survey/respond?token=${token}`));
  });

surveyCommand
  .command("results <surveyId>")
  .description("Show survey results and NPS score")
  .option("--slug <slug>", "Filter by customer slug")
  .action((surveyId: string, opts: { slug?: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const responses = loadSurveyResponses(dataDir, surveyId, opts.slug);
    const nps = calcNpsScore(responses);
    const promoters = responses.filter((r) => r.score >= 9).length;
    const detractors = responses.filter((r) => r.score <= 6).length;

    console.log(bold(`Survey: ${surveyId}`));
    console.log(info(`Responses: ${responses.length}  NPS: ${nps}  Promoters: ${promoters}  Detractors: ${detractors}`));
    for (const r of responses) {
      console.log(`  ${r.slug} <${r.contactEmail}>  score=${r.score}${r.comment ? `  "${r.comment.slice(0, 80)}"` : ""}`);
    }
  });

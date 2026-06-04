import fs from "fs";
import path from "path";
import { writeFileAtomic } from "../fs/atomic-write.js";
import { createHmac } from "crypto";
import yaml from "js-yaml";
import {
  SurveyDefinitionSchema,
  SurveyResponseSchema,
  type SurveyDefinition,
  type SurveyResponse,
} from "../schemas/survey.js";

const SURVEY_SECRET = process.env["DXCRM_SURVEY_SECRET"] ?? "dxcrm-survey-default-secret";

export function surveysDir(dataDir: string): string {
  return path.join(dataDir, ".agentic", "surveys");
}

export function responsesDir(dataDir: string, surveyId: string): string {
  return path.join(dataDir, ".agentic", "survey-responses", surveyId);
}

export function getSurvey(dataDir: string, surveyId: string): SurveyDefinition | null {
  const p = path.join(surveysDir(dataDir), `${surveyId}.yaml`);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = yaml.load(fs.readFileSync(p, "utf-8") as string);
    const result = SurveyDefinitionSchema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function writeSurvey(dataDir: string, survey: SurveyDefinition): void {
  const dir = surveysDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  writeFileAtomic(path.join(dir, `${survey.id}.yaml`), yaml.dump(survey));
}

export function listSurveys(dataDir: string): SurveyDefinition[] {
  const dir = surveysDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .flatMap((f) => {
      const s = getSurvey(dataDir, f.replace(/\.yaml$/, ""));
      return s ? [s] : [];
    });
}

export function generateSurveyToken(slug: string, contactEmail: string, surveyId: string): string {
  return createHmac("sha256", SURVEY_SECRET)
    .update(`${slug}:${contactEmail}:${surveyId}`)
    .digest("hex")
    .slice(0, 16);
}

export function buildSurveyEmail(
  survey: SurveyDefinition,
  serverUrl: string,
  token: string
): { subject: string; body: string } {
  const scores = Array.from(
    { length: survey.scale.max - survey.scale.min + 1 },
    (_, i) => i + survey.scale.min
  );
  const buttons = scores
    .map(
      (s) =>
        `<a href="${serverUrl}/survey/respond?token=${token}&score=${s}" style="display:inline-block;margin:4px;padding:10px 16px;background:#1a1a2e;color:white;text-decoration:none;border-radius:4px;">${s}</a>`
    )
    .join("");

  const body = `<p>${survey.question}</p>
<p>${buttons}</p>
${survey.includeComment ? `<p>Or <a href="${serverUrl}/survey/respond?token=${token}&comment=true">Click here to add a comment</a></p>` : ""}`;

  return {
    subject: survey.type === "nps" ? "How likely are you to recommend us?" : "Rate your experience",
    body,
  };
}

export async function recordSurveyResponse(
  dataDir: string,
  token: string,
  score: number,
  comment?: string
): Promise<SurveyResponse | null> {
  // Find pending response by token
  const pendingDir = path.join(dataDir, ".agentic", "survey-pending");
  if (!fs.existsSync(pendingDir)) return null;

  const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    try {
      const pending = JSON.parse(
        fs.readFileSync(path.join(pendingDir, file), "utf-8") as string
      ) as {
        token: string;
        surveyId: string;
        slug: string;
        contactEmail: string;
        sentAt: string;
      };
      if (pending.token !== token) continue;

      const response: SurveyResponse = {
        surveyId: pending.surveyId,
        slug: pending.slug,
        contactEmail: pending.contactEmail,
        score,
        ...(comment ? { comment } : {}),
        respondedAt: new Date().toISOString(),
        token,
        sentAt: pending.sentAt,
      };

      const dir = responsesDir(dataDir, pending.surveyId);
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${pending.slug}_${pending.contactEmail.replace("@", "_at_")}_${Date.now()}.json`;
      writeFileAtomic(path.join(dir, filename), JSON.stringify(response, null, 2));

      // Delete pending entry
      fs.unlinkSync(path.join(pendingDir, file));
      return response;
    } catch {
      continue;
    }
  }
  return null;
}

export function loadSurveyResponses(
  dataDir: string,
  surveyId: string,
  slug?: string
): SurveyResponse[] {
  const dir = responsesDir(dataDir, surveyId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8") as string) as unknown;
        const parsed = SurveyResponseSchema.safeParse(raw);
        if (!parsed.success) return [];
        if (slug && parsed.data.slug !== slug) return [];
        return [parsed.data];
      } catch {
        return [];
      }
    });
}

export function calcNpsScore(responses: SurveyResponse[]): number {
  if (responses.length === 0) return 0;
  const promoters = responses.filter((r) => r.score >= 9).length;
  const detractors = responses.filter((r) => r.score <= 6).length;
  return Math.round(((promoters - detractors) / responses.length) * 100);
}

export async function savePendingSurvey(
  dataDir: string,
  surveyId: string,
  slug: string,
  contactEmail: string,
  token: string
): Promise<void> {
  const pendingDir = path.join(dataDir, ".agentic", "survey-pending");
  fs.mkdirSync(pendingDir, { recursive: true });
  const filename = `${token}.json`;
  const pending = { token, surveyId, slug, contactEmail, sentAt: new Date().toISOString() };
  writeFileAtomic(path.join(pendingDir, filename), JSON.stringify(pending, null, 2));
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/data";
const SURVEY_ID = "nps-q1";

function makeResponse(slug: string, email: string, score: number, token: string) {
  return JSON.stringify({
    surveyId: SURVEY_ID,
    slug,
    contactEmail: email,
    score,
    respondedAt: "2026-05-30T12:00:00Z",
    token,
    sentAt: "2026-05-29T10:00:00Z",
  });
}

beforeEach(() => {
  vol.reset();
});

describe("handleGetSurveyResults", () => {
  it("returns empty results when no responses", async () => {
    vol.fromJSON({});
    const { handleGetSurveyResults } = await import("../../../src/mcp/tools/get-survey-results.js");
    const result = await handleGetSurveyResults({ surveyId: SURVEY_ID }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { totalResponses: number; npsScore: number };
    expect(parsed.totalResponses).toBe(0);
    expect(parsed.npsScore).toBe(0);
  });

  it("calculates NPS from mixed responses", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/survey-responses/${SURVEY_ID}/acme-alice.json`]: makeResponse("acme", "alice@acme.com", 9, "tok1"),
      [`${DATA_DIR}/.agentic/survey-responses/${SURVEY_ID}/acme-bob.json`]: makeResponse("acme", "bob@acme.com", 8, "tok2"),
      [`${DATA_DIR}/.agentic/survey-responses/${SURVEY_ID}/beta-carol.json`]: makeResponse("beta", "carol@beta.com", 4, "tok3"),
      [`${DATA_DIR}/.agentic/survey-responses/${SURVEY_ID}/beta-dave.json`]: makeResponse("beta", "dave@beta.com", 10, "tok4"),
    });
    const { handleGetSurveyResults } = await import("../../../src/mcp/tools/get-survey-results.js");
    const result = await handleGetSurveyResults({ surveyId: SURVEY_ID }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as {
      totalResponses: number; npsScore: number; promoters: number; passives: number; detractors: number;
    };
    expect(parsed.totalResponses).toBe(4);
    expect(parsed.promoters).toBe(2); // scores 9 and 10
    expect(parsed.passives).toBe(1);  // score 8
    expect(parsed.detractors).toBe(1); // score 4
    // NPS = (2-1)/4 * 100 = 25
    expect(parsed.npsScore).toBe(25);
  });

  it("filters by slug", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/survey-responses/${SURVEY_ID}/acme-alice.json`]: makeResponse("acme", "alice@acme.com", 10, "tok1"),
      [`${DATA_DIR}/.agentic/survey-responses/${SURVEY_ID}/beta-bob.json`]: makeResponse("beta", "bob@beta.com", 3, "tok2"),
    });
    const { handleGetSurveyResults } = await import("../../../src/mcp/tools/get-survey-results.js");
    const result = await handleGetSurveyResults({ surveyId: SURVEY_ID, slug: "acme" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { totalResponses: number; slug: string };
    expect(parsed.totalResponses).toBe(1);
    expect(parsed.slug).toBe("acme");
  });

  it("includes response details", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/survey-responses/${SURVEY_ID}/r1.json`]: makeResponse("acme", "alice@acme.com", 9, "tok1"),
    });
    const { handleGetSurveyResults } = await import("../../../src/mcp/tools/get-survey-results.js");
    const result = await handleGetSurveyResults({ surveyId: SURVEY_ID }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as {
      responses: Array<{ slug: string; email: string; score: number }>;
    };
    expect(parsed.responses[0].slug).toBe("acme");
    expect(parsed.responses[0].score).toBe(9);
  });
});

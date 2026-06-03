import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SurveyDefinition, SurveyResponse } from "../../src/schemas/survey.js";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockListSurveys = vi.hoisted(() => vi.fn());
const mockWriteSurvey = vi.hoisted(() => vi.fn());
const mockGetSurvey = vi.hoisted(() => vi.fn());
const mockLoadSurveyResponses = vi.hoisted(() => vi.fn());
const mockCalcNpsScore = vi.hoisted(() => vi.fn());
const mockGenerateSurveyToken = vi.hoisted(() => vi.fn());
const mockSavePendingSurvey = vi.hoisted(() => vi.fn());

vi.mock("../../src/core/survey-engine.js", () => ({
  listSurveys: mockListSurveys,
  writeSurvey: mockWriteSurvey,
  getSurvey: mockGetSurvey,
  loadSurveyResponses: mockLoadSurveyResponses,
  calcNpsScore: mockCalcNpsScore,
  generateSurveyToken: mockGenerateSurveyToken,
  savePendingSurvey: mockSavePendingSurvey,
}));

function makeSurvey(overrides: Partial<SurveyDefinition> = {}): SurveyDefinition {
  return {
    id: "nps-q1",
    type: "nps",
    question: "How likely are you to recommend us?",
    scale: { min: 0, max: 10 },
    includeComment: true,
    commentPrompt: "Why?",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeResponse(overrides: Partial<SurveyResponse> = {}): SurveyResponse {
  return {
    surveyId: "nps-q1",
    slug: "acme",
    contactEmail: "alice@acme.com",
    score: 9,
    submittedAt: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

const DATA_DIR = "/data";

describe("surveyCommand list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("shows list of surveys", async () => {
    mockListSurveys.mockReturnValue([makeSurvey()]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { surveyCommand } = await import("../../src/commands/survey.js");
    await surveyCommand.parseAsync(["node", "survey", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("nps-q1"));
    consoleSpy.mockRestore();
  });

  it("shows 'No surveys found' when list is empty", async () => {
    mockListSurveys.mockReturnValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { surveyCommand } = await import("../../src/commands/survey.js");
    await surveyCommand.parseAsync(["node", "survey", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No surveys"));
    consoleSpy.mockRestore();
  });
});

describe("surveyCommand create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
    mockWriteSurvey.mockImplementation(() => undefined);
  });

  it("creates a survey and prints success", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { surveyCommand } = await import("../../src/commands/survey.js");
    await surveyCommand.parseAsync(["node", "survey", "create", "nps-q2", "--type", "nps"]);

    expect(mockWriteSurvey).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("created"));
    consoleSpy.mockRestore();
  });
});

describe("surveyCommand send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
    mockGenerateSurveyToken.mockReturnValue("tok_abc123");
    mockSavePendingSurvey.mockResolvedValue(undefined);
  });

  it("generates and prints token URL for existing survey", async () => {
    mockGetSurvey.mockReturnValue(makeSurvey());
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { surveyCommand } = await import("../../src/commands/survey.js");
    await surveyCommand.parseAsync([
      "node",
      "survey",
      "send",
      "nps-q1",
      "--slug",
      "acme",
      "--email",
      "alice@acme.com",
    ]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("tok_abc123"));
    consoleSpy.mockRestore();
  });

  it("exits when survey not found", async () => {
    mockGetSurvey.mockReturnValue(null);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as () => never);

    const { surveyCommand } = await import("../../src/commands/survey.js");
    await expect(
      surveyCommand.parseAsync([
        "node",
        "survey",
        "send",
        "no-such-survey",
        "--slug",
        "acme",
        "--email",
        "alice@acme.com",
      ])
    ).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
    expect(exitSpy).toHaveBeenCalledWith(1);
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe("surveyCommand results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("shows NPS score and responses", async () => {
    mockLoadSurveyResponses.mockReturnValue([makeResponse(), makeResponse({ score: 5 })]);
    mockCalcNpsScore.mockReturnValue(50);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { surveyCommand } = await import("../../src/commands/survey.js");
    await surveyCommand.parseAsync(["node", "survey", "results", "nps-q1"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("nps-q1"));
    consoleSpy.mockRestore();
  });

  it("shows comment when response has one", async () => {
    mockLoadSurveyResponses.mockReturnValue([makeResponse({ comment: "Great product!" })]);
    mockCalcNpsScore.mockReturnValue(100);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { surveyCommand } = await import("../../src/commands/survey.js");
    await surveyCommand.parseAsync(["node", "survey", "results", "nps-q1"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Great product!");
    consoleSpy.mockRestore();
  });
});

describe("surveyCommand — process.cwd() fallbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["DXCRM_DATA_DIR"];
    mockWriteSurvey.mockImplementation(() => undefined);
    mockListSurveys.mockReturnValue([]);
    mockLoadSurveyResponses.mockReturnValue([]);
    mockCalcNpsScore.mockReturnValue(0);
    mockGetSurvey.mockReturnValue(makeSurvey());
    mockGenerateSurveyToken.mockReturnValue("tok_fallback");
    mockSavePendingSurvey.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("list falls back to process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { surveyCommand } = await import("../../src/commands/survey.js");
    await surveyCommand.parseAsync(["node", "survey", "list"]);
    consoleSpy.mockRestore();
  });

  it("create falls back to process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { surveyCommand } = await import("../../src/commands/survey.js");
    await surveyCommand.parseAsync(["node", "survey", "create", "nps-fallback", "--type", "nps"]);
    consoleSpy.mockRestore();
  });

  it("send falls back to process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { surveyCommand } = await import("../../src/commands/survey.js");
    await surveyCommand.parseAsync([
      "node",
      "survey",
      "send",
      "nps-q1",
      "--slug",
      "acme",
      "--email",
      "alice@acme.com",
    ]);
    consoleSpy.mockRestore();
  });

  it("results falls back to process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { surveyCommand } = await import("../../src/commands/survey.js");
    await surveyCommand.parseAsync(["node", "survey", "results", "nps-q1"]);
    consoleSpy.mockRestore();
  });
});

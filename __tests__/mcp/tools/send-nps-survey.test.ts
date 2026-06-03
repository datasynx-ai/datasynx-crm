import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/data";
const SURVEY_ID = "nps-q1";

function makeSurveyYaml(): string {
  return [
    "id: nps-q1",
    "type: nps",
    "question: How likely are you to recommend us?",
    "scale:",
    "  min: 0",
    "  max: 10",
    "includeComment: true",
    `createdAt: '2026-05-30T10:00:00Z'`,
  ].join("\n");
}

beforeEach(() => {
  vol.reset();
});

describe("handleSendNpsSurvey", () => {
  it("returns error when survey not found", async () => {
    vol.fromJSON({});
    const { handleSendNpsSurvey } = await import("../../../src/mcp/tools/send-nps-survey.js");
    const result = await handleSendNpsSurvey(
      { slug: "acme", contactEmail: "a@acme.com", surveyId: "missing" },
      DATA_DIR
    );
    const parsed = JSON.parse(result.content[0].text) as { error: string };
    expect(parsed.error).toContain("missing");
  });

  it("returns token and email body when survey exists", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/surveys/${SURVEY_ID}.yaml`]: makeSurveyYaml(),
    });
    const { handleSendNpsSurvey } = await import("../../../src/mcp/tools/send-nps-survey.js");
    const result = await handleSendNpsSurvey(
      {
        slug: "acme",
        contactEmail: "alice@acme.com",
        surveyId: SURVEY_ID,
        serverUrl: "http://localhost:3847",
      },
      DATA_DIR
    );
    const parsed = JSON.parse(result.content[0].text) as {
      token: string;
      subject: string;
      body: string;
      surveyUrl: string;
    };
    expect(parsed.token).toBeTruthy();
    expect(parsed.subject).toBeTruthy();
    expect(parsed.body).toContain("localhost:3847");
    expect(parsed.surveyUrl).toContain(parsed.token);
  });

  it("saves pending survey file", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/surveys/${SURVEY_ID}.yaml`]: makeSurveyYaml(),
    });
    const { handleSendNpsSurvey } = await import("../../../src/mcp/tools/send-nps-survey.js");
    await handleSendNpsSurvey(
      { slug: "acme", contactEmail: "alice@acme.com", surveyId: SURVEY_ID },
      DATA_DIR
    );
    const pendingDir = `${DATA_DIR}/.agentic/survey-pending`;
    const { fs } = await import("memfs");
    expect(fs.existsSync(pendingDir)).toBe(true);
    const files = fs.readdirSync(pendingDir) as string[];
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.json$/);
  });

  it("token is deterministic for same inputs", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/surveys/${SURVEY_ID}.yaml`]: makeSurveyYaml(),
    });
    const { handleSendNpsSurvey } = await import("../../../src/mcp/tools/send-nps-survey.js");
    const r1 = await handleSendNpsSurvey(
      { slug: "acme", contactEmail: "alice@acme.com", surveyId: SURVEY_ID },
      DATA_DIR
    );
    const r2 = await handleSendNpsSurvey(
      { slug: "acme", contactEmail: "alice@acme.com", surveyId: SURVEY_ID },
      DATA_DIR
    );
    const t1 = (JSON.parse(r1.content[0].text) as { token: string }).token;
    const t2 = (JSON.parse(r2.content[0].text) as { token: string }).token;
    expect(t1).toBe(t2);
  });

  it("registered handler invokes handleSendNpsSurvey with optional serverUrl", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/surveys/${SURVEY_ID}.yaml`]: makeSurveyYaml(),
    });
    const { registerSendNpsSurvey } = await import("../../../src/mcp/tools/send-nps-survey.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerSendNpsSurvey(fakeServer as never, DATA_DIR);
    const result = await capturedHandler!({
      slug: "acme",
      contactEmail: "alice@acme.com",
      surveyId: SURVEY_ID,
      serverUrl: "https://crm.example.com",
    });
    const parsed = JSON.parse(result.content[0]!.text) as { token: string };
    expect(typeof parsed.token).toBe("string");
  });
});

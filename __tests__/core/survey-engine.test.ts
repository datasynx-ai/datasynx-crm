import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";

// ─── generateSurveyToken ─────────────────────────────────────────────────────

describe("generateSurveyToken", () => {
  it("returns a 16-char hex string", async () => {
    const { generateSurveyToken } = await import("../../src/core/survey-engine.js");
    const token = generateSurveyToken("acme", "alice@acme.com", "nps-q1");
    expect(token).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same inputs", async () => {
    const { generateSurveyToken } = await import("../../src/core/survey-engine.js");
    const a = generateSurveyToken("acme", "alice@acme.com", "nps-q1");
    const b = generateSurveyToken("acme", "alice@acme.com", "nps-q1");
    expect(a).toBe(b);
  });

  it("differs for different emails", async () => {
    const { generateSurveyToken } = await import("../../src/core/survey-engine.js");
    const a = generateSurveyToken("acme", "alice@acme.com", "nps-q1");
    const b = generateSurveyToken("acme", "bob@acme.com", "nps-q1");
    expect(a).not.toBe(b);
  });
});

// ─── writeSurvey / getSurvey ──────────────────────────────────────────────────

describe("writeSurvey / getSurvey", () => {
  it("round-trips a survey definition", async () => {
    vol.fromJSON({});
    const { writeSurvey, getSurvey } = await import("../../src/core/survey-engine.js");
    const survey = {
      id: "nps-q1",
      type: "nps" as const,
      question: "Would you recommend us?",
      scale: { min: 0, max: 10 },
      includeComment: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    writeSurvey(DATA_DIR, survey);
    const loaded = getSurvey(DATA_DIR, "nps-q1");
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe("nps-q1");
    expect(loaded?.type).toBe("nps");
  });

  it("returns null for missing survey", async () => {
    vol.fromJSON({});
    const { getSurvey } = await import("../../src/core/survey-engine.js");
    expect(getSurvey(DATA_DIR, "nonexistent")).toBeNull();
  });

  it("returns null when survey file has invalid YAML", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/surveys/bad.yaml`]: "key: [unclosed",
    });
    const { getSurvey } = await import("../../src/core/survey-engine.js");
    expect(getSurvey(DATA_DIR, "bad")).toBeNull();
  });
});

// ─── listSurveys ─────────────────────────────────────────────────────────────

describe("listSurveys", () => {
  it("returns empty array when surveys dir does not exist", async () => {
    vol.fromJSON({});
    const { listSurveys } = await import("../../src/core/survey-engine.js");
    expect(listSurveys(DATA_DIR)).toHaveLength(0);
  });

  it("returns all written surveys", async () => {
    vol.fromJSON({});
    const { writeSurvey, listSurveys } = await import("../../src/core/survey-engine.js");
    writeSurvey(DATA_DIR, {
      id: "nps-q1",
      type: "nps",
      question: "Rate us",
      scale: { min: 0, max: 10 },
      includeComment: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const all = listSurveys(DATA_DIR);
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe("nps-q1");
  });
});

// ─── buildSurveyEmail ─────────────────────────────────────────────────────────

describe("buildSurveyEmail", () => {
  it("returns subject and body with score links", async () => {
    const { buildSurveyEmail } = await import("../../src/core/survey-engine.js");
    const survey = {
      id: "nps-q1",
      type: "nps" as const,
      question: "Rate us 0-10",
      scale: { min: 0, max: 10 },
      includeComment: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const { subject, body } = buildSurveyEmail(survey, "https://crm.example.com", "abc123");
    expect(subject).toMatch(/recommend/i);
    expect(body).toContain("?token=abc123&score=0");
    expect(body).toContain("?token=abc123&score=10");
  });

  it("generates 11 score links for 0-10 scale", async () => {
    const { buildSurveyEmail } = await import("../../src/core/survey-engine.js");
    const survey = {
      id: "s",
      type: "nps" as const,
      question: "Q",
      scale: { min: 0, max: 10 },
      includeComment: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const { body } = buildSurveyEmail(survey, "https://x.com", "tok");
    const matches = body.match(/score=\d+/g) ?? [];
    expect(matches).toHaveLength(11);
  });
});

// ─── calcNpsScore ─────────────────────────────────────────────────────────────

describe("calcNpsScore", () => {
  it("returns 0 for empty responses", async () => {
    const { calcNpsScore } = await import("../../src/core/survey-engine.js");
    expect(calcNpsScore([])).toBe(0);
  });

  it("calculates NPS correctly: all promoters → 100", async () => {
    const { calcNpsScore } = await import("../../src/core/survey-engine.js");
    const responses = [9, 10, 10, 9].map((score) => ({
      surveyId: "s",
      slug: "a",
      contactEmail: "a@b.com",
      score,
      respondedAt: "2026-01-01T00:00:00.000Z",
      token: "t",
      sentAt: "2026-01-01T00:00:00.000Z",
    }));
    expect(calcNpsScore(responses)).toBe(100);
  });

  it("calculates NPS correctly: all detractors → -100", async () => {
    const { calcNpsScore } = await import("../../src/core/survey-engine.js");
    const responses = [0, 1, 6, 5].map((score) => ({
      surveyId: "s",
      slug: "a",
      contactEmail: "a@b.com",
      score,
      respondedAt: "2026-01-01T00:00:00.000Z",
      token: "t",
      sentAt: "2026-01-01T00:00:00.000Z",
    }));
    expect(calcNpsScore(responses)).toBe(-100);
  });

  it("calculates mixed NPS: 2 promoters 1 detractor out of 4 → 25", async () => {
    const { calcNpsScore } = await import("../../src/core/survey-engine.js");
    const responses = [10, 9, 5, 8].map((score) => ({
      surveyId: "s",
      slug: "a",
      contactEmail: "a@b.com",
      score,
      respondedAt: "2026-01-01T00:00:00.000Z",
      token: "t",
      sentAt: "2026-01-01T00:00:00.000Z",
    }));
    // promoters=2, detractors=1, total=4 → (2-1)/4*100 = 25
    expect(calcNpsScore(responses)).toBe(25);
  });
});

// ─── savePendingSurvey / recordSurveyResponse ─────────────────────────────────

describe("savePendingSurvey / recordSurveyResponse", () => {
  it("saves pending and records response by token", async () => {
    vol.fromJSON({});
    const { savePendingSurvey, recordSurveyResponse, loadSurveyResponses } =
      await import("../../src/core/survey-engine.js");
    await savePendingSurvey(DATA_DIR, "nps-q1", "acme", "alice@acme.com", "tok123abc456def7");
    const resp = await recordSurveyResponse(DATA_DIR, "tok123abc456def7", 9, "Great product!");
    expect(resp).not.toBeNull();
    expect(resp?.score).toBe(9);
    expect(resp?.comment).toBe("Great product!");
    expect(resp?.slug).toBe("acme");

    const responses = loadSurveyResponses(DATA_DIR, "nps-q1");
    expect(responses).toHaveLength(1);
    expect(responses[0]?.score).toBe(9);
  });

  it("returns null for unknown token", async () => {
    vol.fromJSON({});
    const { recordSurveyResponse } = await import("../../src/core/survey-engine.js");
    const resp = await recordSurveyResponse(DATA_DIR, "unknown-token", 5);
    expect(resp).toBeNull();
  });

  it("loadSurveyResponses filters by slug", async () => {
    vol.fromJSON({});
    const { savePendingSurvey, recordSurveyResponse, loadSurveyResponses } =
      await import("../../src/core/survey-engine.js");
    await savePendingSurvey(DATA_DIR, "nps-q1", "acme", "a@acme.com", "tok1");
    await savePendingSurvey(DATA_DIR, "nps-q1", "beta", "b@beta.com", "tok2");
    await recordSurveyResponse(DATA_DIR, "tok1", 10);
    await recordSurveyResponse(DATA_DIR, "tok2", 3);

    const acmeOnly = loadSurveyResponses(DATA_DIR, "nps-q1", "acme");
    expect(acmeOnly).toHaveLength(1);
    expect(acmeOnly[0]?.slug).toBe("acme");
  });

  it("recordSurveyResponse skips corrupt pending files and returns null", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/survey-pending/bad.json`]: "INVALID JSON{{",
    });
    const { recordSurveyResponse } = await import("../../src/core/survey-engine.js");
    const result = await recordSurveyResponse(DATA_DIR, "any-token", 8);
    expect(result).toBeNull();
  });

  it("loadSurveyResponses skips corrupt response files", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/survey-responses/nps-q1/corrupt.json`]: "NOT JSON{{",
      [`${DATA_DIR}/.agentic/survey-responses/nps-q1/valid.json`]: JSON.stringify({
        surveyId: "nps-q1",
        slug: "acme",
        contactEmail: "alice@acme.com",
        score: 9,
        respondedAt: "2026-06-01T00:00:00Z",
        token: "tok1",
        sentAt: "2026-05-31T00:00:00Z",
      }),
    });
    const { loadSurveyResponses } = await import("../../src/core/survey-engine.js");
    const responses = loadSurveyResponses(DATA_DIR, "nps-q1");
    expect(responses).toHaveLength(1);
    expect(responses[0]?.slug).toBe("acme");
  });
});

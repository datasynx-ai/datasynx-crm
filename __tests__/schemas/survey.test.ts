import { describe, it, expect } from "vitest";
import { SurveyDefinitionSchema, SurveyResponseSchema } from "../../src/schemas/survey.js";

describe("SurveyDefinitionSchema", () => {
  const valid = {
    id: "nps-q1-2026",
    type: "nps",
    question: "How likely are you to recommend us to a friend or colleague?",
    scale: { min: 0, max: 10 },
    includeComment: true,
    createdAt: "2026-05-30T10:00:00Z",
  };

  it("accepts a valid NPS survey", () => {
    expect(SurveyDefinitionSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults type to nps", () => {
    const result = SurveyDefinitionSchema.safeParse({ ...valid, type: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe("nps");
  });

  it("defaults includeComment to true", () => {
    const result = SurveyDefinitionSchema.safeParse({ ...valid, includeComment: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.includeComment).toBe(true);
  });

  it("accepts csat and ces types", () => {
    expect(SurveyDefinitionSchema.safeParse({ ...valid, type: "csat" }).success).toBe(true);
    expect(SurveyDefinitionSchema.safeParse({ ...valid, type: "ces" }).success).toBe(true);
  });

  it("rejects invalid type", () => {
    expect(SurveyDefinitionSchema.safeParse({ ...valid, type: "rating" }).success).toBe(false);
  });

  it("accepts optional commentPrompt", () => {
    const result = SurveyDefinitionSchema.safeParse({ ...valid, commentPrompt: "What could we improve?" });
    expect(result.success).toBe(true);
  });

  it("rejects empty id", () => {
    expect(SurveyDefinitionSchema.safeParse({ ...valid, id: "" }).success).toBe(false);
  });
});

describe("SurveyResponseSchema", () => {
  const valid = {
    surveyId: "nps-q1-2026",
    slug: "acme-corp",
    contactEmail: "alice@acme.com",
    score: 9,
    respondedAt: "2026-05-30T12:00:00Z",
    token: "abc123",
    sentAt: "2026-05-29T10:00:00Z",
  };

  it("accepts a valid response", () => {
    expect(SurveyResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional comment", () => {
    const result = SurveyResponseSchema.safeParse({ ...valid, comment: "Great support!" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.comment).toBe("Great support!");
  });

  it("rejects invalid email", () => {
    expect(SurveyResponseSchema.safeParse({ ...valid, contactEmail: "not-an-email" }).success).toBe(false);
  });

  it("rejects non-integer score", () => {
    expect(SurveyResponseSchema.safeParse({ ...valid, score: 8.5 }).success).toBe(false);
  });
});

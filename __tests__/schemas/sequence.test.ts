import { describe, it, expect } from "vitest";
import {
  SequenceStepSchema,
  SequenceSchema,
  SequenceEnrollmentSchema,
} from "../../src/schemas/sequence.js";

describe("SequenceStepSchema", () => {
  it("parses a valid step", () => {
    const result = SequenceStepSchema.safeParse({
      day: 3,
      templateId: "intro",
      skipIfReplied: true,
    });
    expect(result.success).toBe(true);
  });

  it("applies default skipIfReplied=true", () => {
    const result = SequenceStepSchema.parse({ day: 0, templateId: "t1" });
    expect(result.skipIfReplied).toBe(true);
  });

  it("rejects negative day", () => {
    const result = SequenceStepSchema.safeParse({ day: -1, templateId: "t1", skipIfReplied: true });
    expect(result.success).toBe(false);
  });

  it("rejects empty templateId", () => {
    const result = SequenceStepSchema.safeParse({ day: 0, templateId: "", skipIfReplied: true });
    expect(result.success).toBe(false);
  });
});

describe("SequenceSchema", () => {
  it("parses a valid sequence", () => {
    const result = SequenceSchema.safeParse({
      id: "outreach",
      name: "Cold Outreach",
      steps: [{ day: 0, templateId: "intro", skipIfReplied: true }],
      createdAt: "2026-05-29T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects sequence with no steps", () => {
    const result = SequenceSchema.safeParse({
      id: "empty",
      name: "Empty",
      steps: [],
      createdAt: "2026-05-29T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("leaves starter undefined when omitted", () => {
    const result = SequenceSchema.safeParse({
      id: "outreach",
      name: "Cold Outreach",
      steps: [{ day: 0, templateId: "intro", skipIfReplied: true }],
      createdAt: "2026-05-29T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.starter).toBeUndefined();
  });

  it("accepts an explicit starter flag", () => {
    const result = SequenceSchema.safeParse({
      id: "outreach",
      name: "Cold Outreach",
      steps: [{ day: 0, templateId: "intro", skipIfReplied: true }],
      starter: true,
      createdAt: "2026-05-29T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.starter).toBe(true);
  });
});

describe("SequenceEnrollmentSchema", () => {
  it("parses a valid enrollment", () => {
    const result = SequenceEnrollmentSchema.safeParse({
      id: "enroll_123",
      sequenceId: "outreach",
      slug: "acme",
      contactEmail: "ceo@acme.com",
      enrolledAt: "2026-05-29T00:00:00.000Z",
      status: "active",
      currentStep: 0,
      stepsCompleted: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = SequenceEnrollmentSchema.safeParse({
      id: "e1",
      sequenceId: "s1",
      slug: "acme",
      contactEmail: "x@x.com",
      enrolledAt: "2026-05-29T00:00:00.000Z",
      status: "invalid",
      currentStep: 0,
      stepsCompleted: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = SequenceEnrollmentSchema.safeParse({
      id: "e1",
      sequenceId: "s1",
      slug: "acme",
      contactEmail: "not-an-email",
      enrolledAt: "2026-05-29T00:00:00.000Z",
      status: "active",
      currentStep: 0,
      stepsCompleted: [],
    });
    expect(result.success).toBe(false);
  });
});

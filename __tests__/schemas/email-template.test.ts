import { describe, it, expect } from "vitest";
import { EmailTemplateSchema } from "../../src/schemas/email-template.js";

describe("EmailTemplateSchema", () => {
  const valid = {
    id: "follow-up-proposal",
    subject: "Following up on our proposal",
    category: "sales",
    variables: ["{{customerName}}", "{{dealValue}}"],
    language: "en",
    createdAt: "2026-05-30T10:00:00Z",
  };

  it("accepts a valid template", () => {
    expect(EmailTemplateSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults category to general", () => {
    const result = EmailTemplateSchema.safeParse({ ...valid, category: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.category).toBe("general");
  });

  it("defaults variables to empty array", () => {
    const result = EmailTemplateSchema.safeParse({ ...valid, variables: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.variables).toEqual([]);
  });

  it("defaults language to de", () => {
    const result = EmailTemplateSchema.safeParse({ ...valid, language: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.language).toBe("de");
  });

  it("accepts optional updatedAt", () => {
    const result = EmailTemplateSchema.safeParse({ ...valid, updatedAt: "2026-05-31T10:00:00Z" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.updatedAt).toBe("2026-05-31T10:00:00Z");
  });

  it("rejects empty id", () => {
    expect(EmailTemplateSchema.safeParse({ ...valid, id: "" }).success).toBe(false);
  });

  it("rejects empty subject", () => {
    expect(EmailTemplateSchema.safeParse({ ...valid, subject: "" }).success).toBe(false);
  });

  it("leaves starter undefined when omitted (no pollution of user templates)", () => {
    const result = EmailTemplateSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.starter).toBeUndefined();
  });

  it("accepts an explicit starter flag", () => {
    const result = EmailTemplateSchema.safeParse({ ...valid, starter: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.starter).toBe(true);
  });
});

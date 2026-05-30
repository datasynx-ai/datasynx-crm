import { describe, it, expect } from "vitest";
import { KbArticleSchema } from "../../src/schemas/kb-article.js";

describe("KbArticleSchema", () => {
  const valid = {
    id: "troubleshoot-api-timeout",
    title: "How to fix API timeout errors",
    category: "troubleshooting",
    tags: ["api", "timeout"],
    public: true,
    createdAt: "2026-05-30T10:00:00Z",
    updatedAt: "2026-05-30T10:00:00Z",
  };

  it("accepts a valid article", () => {
    expect(KbArticleSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults category to general", () => {
    const result = KbArticleSchema.safeParse({ ...valid, category: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.category).toBe("general");
  });

  it("defaults tags to empty array", () => {
    const result = KbArticleSchema.safeParse({ ...valid, tags: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tags).toEqual([]);
  });

  it("defaults public to false", () => {
    const result = KbArticleSchema.safeParse({ ...valid, public: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.public).toBe(false);
  });

  it("accepts optional sourceTicketId", () => {
    const result = KbArticleSchema.safeParse({ ...valid, sourceTicketId: "T-042" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sourceTicketId).toBe("T-042");
  });

  it("rejects empty id", () => {
    expect(KbArticleSchema.safeParse({ ...valid, id: "" }).success).toBe(false);
  });

  it("rejects empty title", () => {
    expect(KbArticleSchema.safeParse({ ...valid, title: "" }).success).toBe(false);
  });
});

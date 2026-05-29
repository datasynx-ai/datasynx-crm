import { describe, it, expect } from "vitest";
import { surveyThankYouPage } from "../../src/mcp/server.js";

describe("surveyThankYouPage", () => {
  it("shows 🎉 for promoter score (9–10)", () => {
    const html = surveyThankYouPage(9);
    expect(html).toContain("🎉");
    expect(html).toContain("9/10");
  });

  it("shows 🙂 for passive score (7–8)", () => {
    const html = surveyThankYouPage(7);
    expect(html).toContain("🙂");
    expect(html).toContain("7/10");
  });

  it("shows 🙏 for detractor score (0–6)", () => {
    const html = surveyThankYouPage(4);
    expect(html).toContain("🙏");
    expect(html).toContain("4/10");
  });

  it("includes comment text when provided", () => {
    const html = surveyThankYouPage(8, "Great support team!");
    expect(html).toContain("Great support team!");
  });

  it("XSS-escapes comment text", () => {
    const html = surveyThankYouPage(5, "<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not include comment section when comment is undefined", () => {
    const html = surveyThankYouPage(8);
    expect(html).not.toContain("Your comment:");
  });

  it("returns valid HTML with DOCTYPE", () => {
    const html = surveyThankYouPage(6);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("</html>");
  });
});

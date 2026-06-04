import { describe, it, expect } from "vitest";
import { parseTurns, analyzeConversation } from "../../src/core/conversation-intel.js";

const TRANSCRIPT = `Rep: Hi, thanks for joining today. How are things going with your current setup?
Customer: Pretty good, though we have some concerns about the price.
Rep: I understand. Let me walk you through the value. Our platform handles everything end to end, and we have seen great results, and customers love it, and onboarding is fast, and support is excellent.
Customer: That sounds expensive for our budget.
Rep: What would make this a clear win for you?`;

describe("conversation intelligence", () => {
  it("parses speaker turns", () => {
    const turns = parseTurns(TRANSCRIPT);
    expect(turns).toHaveLength(5);
    expect(turns[0]!.speaker).toBe("Rep");
    expect(turns[1]!.speaker).toBe("Customer");
  });

  it("computes talk ratio, questions and objections", () => {
    const a = analyzeConversation(TRANSCRIPT);
    expect(a.talkRatio).toBeGreaterThan(0.5); // rep dominates word count
    expect(a.questionsAsked).toBeGreaterThanOrEqual(2);
    expect(a.objections.length).toBeGreaterThanOrEqual(1);
    expect(a.coaching.length).toBeGreaterThan(0);
  });

  it("suggests listening more when the rep dominates the conversation", () => {
    const a = analyzeConversation(TRANSCRIPT);
    expect(a.coaching.join(" ").toLowerCase()).toMatch(/listen|talk/);
  });

  it("handles an unlabeled transcript gracefully", () => {
    const a = analyzeConversation("just some free text with no speakers and a concern about cost");
    expect(a.turns).toBe(0);
    expect(a.objections.length).toBeGreaterThanOrEqual(1);
  });
});

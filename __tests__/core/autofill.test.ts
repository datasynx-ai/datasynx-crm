import { describe, it, expect } from "vitest";
import { heuristicExtract, extractAutofill } from "../../src/core/autofill.js";

const TRANSCRIPT = [
  "Call with Alice from Acme.",
  "She is worried the price is too expensive.",
  "We are in negotiation on the enterprise license.",
  "Next step: send the revised proposal by Friday.",
  "Action item: loop in legal.",
].join("\n");

describe("heuristicExtract", () => {
  it("extracts next steps, stage, and objections deterministically", () => {
    const r = heuristicExtract(TRANSCRIPT);
    expect(r.stage).toBe("negotiation");
    expect(r.nextSteps.join(" ")).toMatch(/revised proposal/i);
    expect(r.nextSteps.length).toBeGreaterThanOrEqual(2);
    expect(r.objections.join(" ")).toMatch(/expensive|worried/i);
    expect(r.summary.length).toBeGreaterThan(0);
  });

  it("returns empty fields for an unstructured transcript", () => {
    const r = heuristicExtract("just some chit chat about the weather");
    expect(r.nextSteps).toEqual([]);
    expect(r.stage).toBeUndefined();
  });
});

describe("extractAutofill", () => {
  it("falls back to the heuristic when no LLM is available", async () => {
    // No ANTHROPIC_API_KEY in tests → callLlm throws → heuristic fallback.
    const r = await extractAutofill(TRANSCRIPT);
    expect(r.stage).toBe("negotiation");
    expect(r.nextSteps.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect, vi } from "vitest";

const mockCallLlm = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/llm.js", () => ({ callLlm: mockCallLlm }));
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
    mockCallLlm.mockRejectedValueOnce(new Error("no llm configured"));
    const r = await extractAutofill(TRANSCRIPT);
    expect(r.stage).toBe("negotiation");
    expect(r.nextSteps.length).toBeGreaterThan(0);
  });
});

describe("extractAutofill — LLM paths (#69)", () => {
  it("uses LLM fields incl. stage when the model returns full JSON", async () => {
    const { extractAutofill } = await import("../../src/core/autofill.js");
    mockCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        summary: "Pricing call",
        nextSteps: ["Send proposal"],
        objections: ["too expensive"],
        stage: "proposal",
      })
    );
    const r = await extractAutofill(TRANSCRIPT);
    expect(r).toEqual({
      summary: "Pricing call",
      nextSteps: ["Send proposal"],
      objections: ["too expensive"],
      stage: "proposal",
    });
  });

  it("fills defaults when the model returns sparse JSON without a stage", async () => {
    const { extractAutofill } = await import("../../src/core/autofill.js");
    mockCallLlm.mockResolvedValueOnce(JSON.stringify({ nextSteps: "not-an-array" }));
    const r = await extractAutofill(TRANSCRIPT);
    expect(r.summary).toBe(TRANSCRIPT.slice(0, 400));
    expect(r.nextSteps).toEqual([]);
    expect(r.objections).toEqual([]);
    expect(r.stage).toBeUndefined();
  });

  it("falls back to the heuristic on malformed model output", async () => {
    const { extractAutofill } = await import("../../src/core/autofill.js");
    mockCallLlm.mockResolvedValueOnce("Sure! Here is the JSON you asked for…");
    const r = await extractAutofill(TRANSCRIPT);
    expect(r.stage).toBe("negotiation");
  });
});

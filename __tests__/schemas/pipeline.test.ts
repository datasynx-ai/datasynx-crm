import { describe, it, expect } from "vitest";
import { PipelineDealSchema, type PipelineDeal } from "../../src/schemas/pipeline.js";

describe("PipelineDealSchema", () => {
  const validDeal: PipelineDeal = {
    name: "Acme Corp Enterprise License",
    stage: "proposal",
    currency: "EUR",
    updated: "2024-06-01",
  };

  it("accepts a minimal valid deal", () => {
    const result = PipelineDealSchema.safeParse(validDeal);
    expect(result.success).toBe(true);
  });

  it("accepts a fully populated deal", () => {
    const full: PipelineDeal = {
      name: "Acme Corp Enterprise License",
      stage: "negotiation",
      value: 50000,
      currency: "USD",
      probability: 75,
      close_date: "2024-12-31",
      notes: "Decision maker is Max Mustermann",
      updated: "2024-06-01",
    };
    const result = PipelineDealSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it("requires name", () => {
    const { name: _name, ...withoutName } = validDeal;
    const result = PipelineDealSchema.safeParse(withoutName);
    expect(result.success).toBe(false);
  });

  it("requires stage", () => {
    const { stage: _stage, ...withoutStage } = validDeal;
    const result = PipelineDealSchema.safeParse(withoutStage);
    expect(result.success).toBe(false);
  });

  it("requires updated", () => {
    const { updated: _updated, ...withoutUpdated } = validDeal;
    const result = PipelineDealSchema.safeParse(withoutUpdated);
    expect(result.success).toBe(false);
  });

  it("accepts all valid stage values", () => {
    const stages = ["lead", "qualified", "proposal", "negotiation", "won", "lost"] as const;
    for (const stage of stages) {
      const result = PipelineDealSchema.safeParse({ ...validDeal, stage });
      expect(result.success).toBe(true);
    }
  });

  it("accepts custom stage ids — pipeline-aware validation happens in update_deal (#47)", () => {
    const result = PipelineDealSchema.safeParse({ ...validDeal, stage: "renewal-review" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty stage", () => {
    const result = PipelineDealSchema.safeParse({ ...validDeal, stage: "" });
    expect(result.success).toBe(false);
  });

  it("defaults currency to EUR", () => {
    const { currency: _currency, ...withoutCurrency } = validDeal;
    const result = PipelineDealSchema.safeParse(withoutCurrency);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("EUR");
    }
  });

  it("probability must be 0-100 if provided", () => {
    const tooHigh = PipelineDealSchema.safeParse({ ...validDeal, probability: 101 });
    expect(tooHigh.success).toBe(false);

    const tooLow = PipelineDealSchema.safeParse({ ...validDeal, probability: -1 });
    expect(tooLow.success).toBe(false);

    const valid0 = PipelineDealSchema.safeParse({ ...validDeal, probability: 0 });
    expect(valid0.success).toBe(true);

    const valid100 = PipelineDealSchema.safeParse({ ...validDeal, probability: 100 });
    expect(valid100.success).toBe(true);
  });

  it("close_date must be YYYY-MM-DD format if provided", () => {
    const invalid = PipelineDealSchema.safeParse({ ...validDeal, close_date: "31.12.2024" });
    expect(invalid.success).toBe(false);

    const valid = PipelineDealSchema.safeParse({ ...validDeal, close_date: "2024-12-31" });
    expect(valid.success).toBe(true);
  });

  it("updated must be YYYY-MM-DD format", () => {
    const result = PipelineDealSchema.safeParse({ ...validDeal, updated: "2024/06/01" });
    expect(result.success).toBe(false);
  });

  it("value must be a number if provided", () => {
    const result = PipelineDealSchema.safeParse({ ...validDeal, value: "50000" });
    expect(result.success).toBe(false);
  });
});

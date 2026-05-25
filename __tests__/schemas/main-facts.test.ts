import { describe, it, expect } from "vitest";
import { MainFactsSchema, type MainFacts } from "../../src/schemas/main-facts.js";

describe("MainFactsSchema", () => {
  const validFacts: MainFacts = {
    name: "Acme Corp",
    relationship_stage: "active",
    tags: [],
    currency: "EUR",
    created: "2024-01-15",
    updated: "2024-01-15",
  };

  it("accepts a minimal valid object", () => {
    const result = MainFactsSchema.safeParse(validFacts);
    expect(result.success).toBe(true);
  });

  it("accepts a fully populated object", () => {
    const full = {
      name: "Acme Corp",
      domain: "acme.com",
      email: "max@acme.com",
      phone: "+49 123 456789",
      industry: "SaaS",
      relationship_stage: "prospect",
      deal_value: 50000,
      currency: "USD",
      primary_contact: "Max Mustermann",
      timezone: "Europe/Berlin",
      tags: ["enterprise", "priority"],
      created: "2024-01-15",
      updated: "2024-06-01",
    };
    const result = MainFactsSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it("requires name", () => {
    const { name: _name, ...withoutName } = validFacts;
    const result = MainFactsSchema.safeParse(withoutName);
    expect(result.success).toBe(false);
  });

  it("requires created", () => {
    const { created: _created, ...withoutCreated } = validFacts;
    const result = MainFactsSchema.safeParse(withoutCreated);
    expect(result.success).toBe(false);
  });

  it("requires updated", () => {
    const { updated: _updated, ...withoutUpdated } = validFacts;
    const result = MainFactsSchema.safeParse(withoutUpdated);
    expect(result.success).toBe(false);
  });

  it("requires valid relationship_stage enum", () => {
    const result = MainFactsSchema.safeParse({
      ...validFacts,
      relationship_stage: "unknown_stage",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid relationship_stage values", () => {
    const stages = ["prospect", "active", "churned", "paused"] as const;
    for (const stage of stages) {
      const result = MainFactsSchema.safeParse({ ...validFacts, relationship_stage: stage });
      expect(result.success).toBe(true);
    }
  });

  it("requires created to be YYYY-MM-DD format", () => {
    const result = MainFactsSchema.safeParse({
      ...validFacts,
      created: "15-01-2024",
    });
    expect(result.success).toBe(false);
  });

  it("requires updated to be YYYY-MM-DD format", () => {
    const result = MainFactsSchema.safeParse({
      ...validFacts,
      updated: "2024/01/15",
    });
    expect(result.success).toBe(false);
  });

  it("defaults tags to empty array when not provided", () => {
    const { tags: _tags, ...withoutTags } = validFacts;
    const result = MainFactsSchema.safeParse(withoutTags);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
    }
  });

  it("defaults currency to EUR when not provided", () => {
    const { currency: _currency, ...withoutCurrency } = validFacts;
    const result = MainFactsSchema.safeParse(withoutCurrency);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("EUR");
    }
  });

  it("deal_value must be a number if provided", () => {
    const result = MainFactsSchema.safeParse({
      ...validFacts,
      deal_value: "not-a-number",
    });
    expect(result.success).toBe(false);
  });

  it("optional fields are truly optional", () => {
    const minimal = {
      name: "Minimal Corp",
      relationship_stage: "active",
      created: "2024-01-01",
      updated: "2024-01-01",
    };
    const result = MainFactsSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });
});

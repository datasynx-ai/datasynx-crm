import { describe, it, expect } from "vitest";
import { renderCustomerTable, renderPipelineTable } from "../../src/ui/table.js";
import type { CustomerRow } from "../../src/ui/table.js";
import type { PipelineDeal } from "../../src/schemas/pipeline.js";

const makeFacts = (overrides: Record<string, unknown> = {}) => ({
  name: "Acme Corp",
  relationship_stage: "customer" as const,
  industry: "SaaS",
  tags: ["enterprise"],
  updated: "2026-01-01",
  domain: "acme.com",
  last_touchpoint: "2026-01-01",
  created: "2026-01-01",
  ...overrides,
});

describe("renderCustomerTable", () => {
  it("returns a non-empty string for one customer", () => {
    const rows: CustomerRow[] = [{ slug: "acme-corp", facts: makeFacts() }];
    const output = renderCustomerTable(rows);
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  it("includes slug and name in output", () => {
    const rows: CustomerRow[] = [{ slug: "acme-corp", facts: makeFacts({ name: "Acme Corp" }) }];
    const output = renderCustomerTable(rows);
    expect(output).toContain("acme-corp");
    expect(output).toContain("Acme Corp");
  });

  it("shows '—' when industry is missing", () => {
    const rows: CustomerRow[] = [
      { slug: "no-industry", facts: makeFacts({ industry: undefined }) },
    ];
    const output = renderCustomerTable(rows);
    expect(output).toContain("—");
  });

  it("shows '—' when tags are empty", () => {
    const rows: CustomerRow[] = [{ slug: "no-tags", facts: makeFacts({ tags: [] }) }];
    const output = renderCustomerTable(rows);
    expect(output).toContain("—");
  });

  it("renders multiple customers", () => {
    const rows: CustomerRow[] = [
      { slug: "acme-corp", facts: makeFacts({ name: "Acme Corp" }) },
      { slug: "beta-ltd", facts: makeFacts({ name: "Beta Ltd" }) },
    ];
    const output = renderCustomerTable(rows);
    expect(output).toContain("Acme Corp");
    expect(output).toContain("Beta Ltd");
  });

  it("returns empty table for zero customers", () => {
    const output = renderCustomerTable([]);
    expect(typeof output).toBe("string");
  });
});

describe("renderPipelineTable", () => {
  const makeDeal = (overrides: Partial<PipelineDeal> = {}): PipelineDeal => ({
    name: "Big Deal",
    stage: "proposal",
    value: 50000,
    currency: "USD",
    probability: 0.7,
    close_date: "2026-06-30",
    updated: "2026-01-01",
    notes: "",
    ...overrides,
  });

  it("returns a non-empty string for one deal", () => {
    const output = renderPipelineTable([makeDeal()]);
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  it("includes deal name and stage in output", () => {
    const output = renderPipelineTable([
      makeDeal({ name: "Enterprise Deal", stage: "negotiation" }),
    ]);
    expect(output).toContain("Enterprise Deal");
    expect(output).toContain("negotiation");
  });

  it("shows '—' when value is undefined", () => {
    const output = renderPipelineTable([makeDeal({ value: undefined })]);
    expect(output).toContain("—");
  });

  it("shows '—' when probability is undefined", () => {
    const output = renderPipelineTable([makeDeal({ probability: undefined })]);
    expect(output).toContain("—");
  });

  it("shows '—' when close_date is undefined", () => {
    const output = renderPipelineTable([makeDeal({ close_date: undefined })]);
    expect(output).toContain("—");
  });

  it("formats value with currency", () => {
    const output = renderPipelineTable([makeDeal({ value: 25000, currency: "EUR" })]);
    expect(output).toContain("EUR");
  });

  it("renders empty table for zero deals", () => {
    const output = renderPipelineTable([]);
    expect(typeof output).toBe("string");
  });
});

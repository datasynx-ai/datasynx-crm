import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
});

const DATA_DIR = "/crm";

describe("recordUsage + aggregateUsage", () => {
  it("appends usage entries with computed cost and aggregates per customer", async () => {
    const { recordUsage, aggregateUsage } = await import("../../src/core/usage.js");

    recordUsage(DATA_DIR, {
      slug: "acme",
      tool: "summarize_meeting",
      model: "claude-haiku-4-5",
      inputTokens: 1_000_000,
      outputTokens: 200_000,
    });
    recordUsage(DATA_DIR, {
      slug: "beta",
      model: "claude-haiku-4-5",
      inputTokens: 500_000,
      outputTokens: 0,
    });

    const agg = aggregateUsage(DATA_DIR);
    expect(agg.totalInputTokens).toBe(1_500_000);
    expect(agg.totalOutputTokens).toBe(200_000);
    expect(agg.totalCostUsd).toBeGreaterThan(0);
    expect(agg.bySlug["acme"]!.inputTokens).toBe(1_000_000);
    expect(agg.bySlug["beta"]!.outputTokens).toBe(0);
  });

  it("computes cost from the pricing table (input + output per 1M)", async () => {
    const { recordUsage, loadUsage } = await import("../../src/core/usage.js");
    // default haiku pricing: 1.0 in / 5.0 out per 1M
    recordUsage(DATA_DIR, {
      model: "claude-haiku-4-5",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    const entries = loadUsage(DATA_DIR);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.costUsd).toBeCloseTo(6.0); // 1*1.0 + 1*5.0
  });

  it("filters aggregation by slug", async () => {
    const { recordUsage, aggregateUsage } = await import("../../src/core/usage.js");
    recordUsage(DATA_DIR, {
      slug: "acme",
      model: "claude-haiku-4-5",
      inputTokens: 100,
      outputTokens: 0,
    });
    recordUsage(DATA_DIR, {
      slug: "beta",
      model: "claude-haiku-4-5",
      inputTokens: 999,
      outputTokens: 0,
    });
    const agg = aggregateUsage(DATA_DIR, { slug: "acme" });
    expect(agg.totalInputTokens).toBe(100);
  });
});

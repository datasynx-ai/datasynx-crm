import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/core/lancedb.js", () => ({
  searchKnowledge: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";

describe("searchAcrossCustomers", () => {
  it("returns empty array when no customers directory exists", async () => {
    // vol is empty, no customers dir
    const { searchAcrossCustomers } = await import("../../src/core/cross-customer.js");
    const results = await searchAcrossCustomers(DATA_DIR, "some query");
    expect(results).toEqual([]);
  });

  it("searches across multiple customers", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/main_facts.md`]: "# Acme",
      [`${DATA_DIR}/customers/beta-inc/main_facts.md`]: "# Beta",
    });

    const { searchKnowledge } = await import("../../src/core/lancedb.js");
    const mockSearch = vi.mocked(searchKnowledge);
    mockSearch.mockImplementation(async (_dataDir, slug, _query, _limit) => {
      if (slug === "acme-corp") {
        return [{ content: "Acme content about pricing", score: 0.9, source: "acme-ref" }];
      }
      if (slug === "beta-inc") {
        return [{ content: "Beta content about pricing", score: 0.7, source: "beta-ref" }];
      }
      return [];
    });

    const { searchAcrossCustomers } = await import("../../src/core/cross-customer.js");
    const results = await searchAcrossCustomers(DATA_DIR, "pricing");

    expect(results.length).toBeGreaterThan(0);
    const slugs = results.map((r) => r.slug);
    expect(slugs).toContain("acme-corp");
    expect(slugs).toContain("beta-inc");
  });

  it("excludes the specified slug", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/main_facts.md`]: "# Acme",
      [`${DATA_DIR}/customers/beta-inc/main_facts.md`]: "# Beta",
    });

    const { searchKnowledge } = await import("../../src/core/lancedb.js");
    const mockSearch = vi.mocked(searchKnowledge);
    mockSearch.mockImplementation(async (_dataDir, slug, _query, _limit) => {
      return [{ content: `${slug} content`, score: 0.8, source: `${slug}-ref` }];
    });

    const { searchAcrossCustomers } = await import("../../src/core/cross-customer.js");
    const results = await searchAcrossCustomers(DATA_DIR, "query", 10, "acme-corp");

    const slugs = results.map((r) => r.slug);
    expect(slugs).not.toContain("acme-corp");
    expect(slugs).toContain("beta-inc");
  });

  it("sorts results by score descending", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/alpha/main_facts.md`]: "# Alpha",
      [`${DATA_DIR}/customers/bravo/main_facts.md`]: "# Bravo",
      [`${DATA_DIR}/customers/charlie/main_facts.md`]: "# Charlie",
    });

    const { searchKnowledge } = await import("../../src/core/lancedb.js");
    const mockSearch = vi.mocked(searchKnowledge);
    mockSearch.mockImplementation(async (_dataDir, slug, _query, _limit) => {
      const scores: Record<string, number> = { alpha: 0.5, bravo: 0.9, charlie: 0.3 };
      return [{ content: `${slug} content`, score: scores[slug] ?? 0.5, source: `${slug}-ref` }];
    });

    const { searchAcrossCustomers } = await import("../../src/core/cross-customer.js");
    const results = await searchAcrossCustomers(DATA_DIR, "query");

    expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
    expect(results[1]!.score).toBeGreaterThanOrEqual(results[2]!.score);
  });

  it("respects the limit parameter", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/a/main_facts.md`]: "# A",
      [`${DATA_DIR}/customers/b/main_facts.md`]: "# B",
      [`${DATA_DIR}/customers/c/main_facts.md`]: "# C",
      [`${DATA_DIR}/customers/d/main_facts.md`]: "# D",
      [`${DATA_DIR}/customers/e/main_facts.md`]: "# E",
    });

    const { searchKnowledge } = await import("../../src/core/lancedb.js");
    const mockSearch = vi.mocked(searchKnowledge);
    mockSearch.mockResolvedValue([{ content: "some content", score: 0.8, source: "ref" }]);

    const { searchAcrossCustomers } = await import("../../src/core/cross-customer.js");
    const results = await searchAcrossCustomers(DATA_DIR, "query", 2);

    expect(results).toHaveLength(2);
  });
});

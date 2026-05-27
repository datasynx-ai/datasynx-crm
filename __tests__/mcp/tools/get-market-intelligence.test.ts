import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("../../../src/core/lancedb.js", () => ({
  searchKnowledge: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";

describe("handleGetMarketIntelligence", () => {
  it("returns correct shape with results and totalCustomersSearched", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/main_facts.md`]: "# Acme",
      [`${DATA_DIR}/customers/beta/main_facts.md`]: "# Beta",
    });

    const { searchKnowledge } = await import("../../../src/core/lancedb.js");
    vi.mocked(searchKnowledge).mockResolvedValue([
      { content: "content about pricing", score: 0.85, source: "ref" },
    ]);

    const { handleGetMarketIntelligence } = await import("../../../src/mcp/tools/get-market-intelligence.js");
    const result = await handleGetMarketIntelligence(
      { query: "pricing strategy" },
      DATA_DIR
    );
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      query: string;
      results: unknown[];
      totalCustomersSearched: number;
    };

    expect(parsed.query).toBe("pricing strategy");
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(typeof parsed.totalCustomersSearched).toBe("number");
    expect(parsed.totalCustomersSearched).toBe(2);
  });

  it("passes excludeSlug when excludeCurrentCustomer=true and slug is provided", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/main_facts.md`]: "# Acme",
      [`${DATA_DIR}/customers/beta/main_facts.md`]: "# Beta",
    });

    const { searchKnowledge } = await import("../../../src/core/lancedb.js");
    vi.mocked(searchKnowledge).mockResolvedValue([]);

    const { handleGetMarketIntelligence } = await import("../../../src/mcp/tools/get-market-intelligence.js");
    await handleGetMarketIntelligence(
      { query: "feature requests", excludeCurrentCustomer: true, slug: "acme" },
      DATA_DIR
    );

    // searchKnowledge should only have been called for beta (not acme)
    const slugsCalled = vi.mocked(searchKnowledge).mock.calls.map((c) => c[1]);
    expect(slugsCalled).not.toContain("acme");
    expect(slugsCalled).toContain("beta");
  });
});

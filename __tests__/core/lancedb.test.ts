import { describe, it, expect, vi } from "vitest";

describe("searchKnowledge", () => {
  it("returns empty array when table does not exist", async () => {
    const { searchKnowledge, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();
    const results = await searchKnowledge("/data", "acme-corp", "pricing", 5);
    expect(results).toEqual([]);
  });

  it("returns empty array when LanceDB connection fails", async () => {
    const lancedb = await import("@lancedb/lancedb");
    vi.mocked(lancedb.connect).mockRejectedValueOnce(new Error("connection failed"));

    const { searchKnowledge, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();

    const results = await searchKnowledge("/data", "acme-corp", "pricing", 5);
    expect(results).toEqual([]);
  });

  it("returns results when table exists and search succeeds", async () => {
    const mockRow = { text: "Pricing discussed at €5000/mo", _distance: 0.2, source_ref: "gmail://thread/abc" };
    const lancedb = await import("@lancedb/lancedb");
    vi.mocked(lancedb.connect).mockResolvedValueOnce({
      tableNames: vi.fn().mockResolvedValue(["docs_acme_corp"]),
      openTable: vi.fn().mockResolvedValue({
        search: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([mockRow]),
          }),
        }),
      }),
      createEmptyTable: vi.fn(),
    } as never);

    const { searchKnowledge, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();

    const results = await searchKnowledge("/data", "acme-corp", "pricing", 5);
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toBe("Pricing discussed at €5000/mo");
    expect(results[0]?.score).toBeCloseTo(0.8);
    expect(results[0]?.source).toBe("gmail://thread/abc");
  });

  it("sanitizes slug with special chars for table name", async () => {
    const { searchKnowledge, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();
    // Should not throw — special chars get replaced
    const results = await searchKnowledge("/data", "my-customer.corp", "test", 3);
    expect(Array.isArray(results)).toBe(true);
  });
});

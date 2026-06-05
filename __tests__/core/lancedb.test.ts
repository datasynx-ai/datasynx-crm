import { describe, it, expect, vi, beforeEach } from "vitest";

// Extend the global @lancedb/lancedb mock with the named exports used by lancedb.ts
vi.mock("@lancedb/lancedb", async () => {
  const original = await vi.importActual<Record<string, unknown>>("@lancedb/lancedb");
  return {
    ...original,
    default: {
      connect: vi.fn().mockResolvedValue({
        openTable: vi.fn(),
        createEmptyTable: vi.fn(),
        tableNames: vi.fn().mockResolvedValue([]),
      }),
    },
    connect: vi.fn().mockResolvedValue({
      openTable: vi.fn(),
      createEmptyTable: vi.fn(),
      tableNames: vi.fn().mockResolvedValue([]),
    }),
    makeArrowTable: vi.fn().mockReturnValue({}),
    Index: { btree: vi.fn().mockReturnValue({}), fts: vi.fn().mockReturnValue({}) },
  };
});

beforeEach(() => {
  vi.resetModules();
});

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
    const mockRow = {
      text: "Pricing discussed at €5000/mo",
      _distance: 0.2,
      source_ref: "gmail://thread/abc",
    };
    const lancedb = await import("@lancedb/lancedb");
    vi.mocked(lancedb.connect).mockResolvedValueOnce({
      tableNames: vi.fn().mockResolvedValue(["docs_acme_corp"]),
      openTable: vi.fn().mockResolvedValue({
        createIndex: vi.fn().mockResolvedValue(undefined),
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
    // Score is now a Reciprocal Rank Fusion score (small positive), not 1 - distance.
    expect(results[0]?.score).toBeGreaterThan(0);
    expect(results[0]?.source).toBe("gmail://thread/abc");
  });

  it("fuses vector and full-text legs via RRF and dedupes shared source_refs", async () => {
    // Vector leg ranks B then A; FTS leg ranks A then C. A appears in both
    // legs (best fused rank), B and C each in one. RRF should rank A first.
    const vecRows = [
      { text: "doc B", source_ref: "ref-b", _distance: 0.1 },
      { text: "doc A", source_ref: "ref-a", _distance: 0.3 },
    ];
    const ftsRows = [
      { text: "doc A", source_ref: "ref-a", _score: 9.0 },
      { text: "doc C", source_ref: "ref-c", _score: 4.0 },
    ];
    let call = 0;
    const search = vi.fn().mockImplementation(() => ({
      limit: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(call++ === 0 ? vecRows : ftsRows),
      }),
    }));
    const lancedb = await import("@lancedb/lancedb");
    vi.mocked(lancedb.connect).mockResolvedValueOnce({
      tableNames: vi.fn().mockResolvedValue(["docs_acme_corp"]),
      openTable: vi.fn().mockResolvedValue({
        createIndex: vi.fn().mockResolvedValue(undefined),
        search,
      }),
      createEmptyTable: vi.fn(),
    } as never);

    const { searchKnowledge, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();

    const results = await searchKnowledge("/data", "acme-corp", "doc A", 10);
    // Three distinct docs, A fused to the top.
    expect(results.map((r) => r.source)).toEqual(["ref-a", "ref-b", "ref-c"]);
    expect(results[0]?.content).toBe("doc A");
    // Each source_ref appears exactly once (deduped across legs).
    expect(new Set(results.map((r) => r.source)).size).toBe(results.length);
  });

  it("falls back to vector-only when the full-text leg throws", async () => {
    const vecRows = [{ text: "vector hit", source_ref: "ref-v", _distance: 0.2 }];
    let call = 0;
    const search = vi.fn().mockImplementation(() => {
      // First call (vector) succeeds; second call (fts) throws.
      if (call++ === 0) {
        return { limit: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(vecRows) }) };
      }
      throw new Error("no fts index");
    });
    const lancedb = await import("@lancedb/lancedb");
    vi.mocked(lancedb.connect).mockResolvedValueOnce({
      tableNames: vi.fn().mockResolvedValue(["docs_acme_corp"]),
      openTable: vi.fn().mockResolvedValue({
        createIndex: vi.fn().mockResolvedValue(undefined),
        search,
      }),
      createEmptyTable: vi.fn(),
    } as never);

    const { searchKnowledge, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();

    const results = await searchKnowledge("/data", "acme-corp", "anything", 5);
    expect(results).toHaveLength(1);
    expect(results[0]?.source).toBe("ref-v");
  });

  it("sanitizes slug with special chars for table name", async () => {
    const { searchKnowledge, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();
    // Should not throw — special chars get replaced
    const results = await searchKnowledge("/data", "my-customer.corp", "test", 3);
    expect(Array.isArray(results)).toBe(true);
  });
});

describe("indexInLanceDB", () => {
  function makeMergeInsertChain(executeFn = vi.fn().mockResolvedValue(undefined)) {
    const chain = {
      whenMatchedUpdateAll: vi.fn(),
      whenNotMatchedInsertAll: vi.fn(),
      execute: executeFn,
    };
    chain.whenMatchedUpdateAll.mockReturnValue(chain);
    chain.whenNotMatchedInsertAll.mockReturnValue(chain);
    return chain;
  }

  it("creates table and indexes text when table does not exist", async () => {
    const chain = makeMergeInsertChain();
    const createEmptyTableMock = vi.fn().mockResolvedValue({
      createIndex: vi.fn().mockResolvedValue(undefined),
      mergeInsert: vi.fn().mockReturnValue(chain),
    });
    const lancedb = await import("@lancedb/lancedb");
    vi.mocked(lancedb.connect).mockResolvedValueOnce({
      tableNames: vi.fn().mockResolvedValue([]),
      createEmptyTable: createEmptyTableMock,
      openTable: vi.fn(),
    } as never);

    const { indexInLanceDB, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();
    await indexInLanceDB("/data", "acme-corp", "Meeting notes", "gmail://thread/abc", {
      date: "2026-06-01",
      type: "Email",
    });

    expect(createEmptyTableMock).toHaveBeenCalled();
    expect(chain.execute).toHaveBeenCalled();
  });

  it("uses existing table when it already exists", async () => {
    const chain = makeMergeInsertChain();
    const openTableMock = vi.fn().mockResolvedValue({
      mergeInsert: vi.fn().mockReturnValue(chain),
    });
    const lancedb = await import("@lancedb/lancedb");
    vi.mocked(lancedb.connect).mockResolvedValueOnce({
      tableNames: vi.fn().mockResolvedValue(["docs_acme_corp"]),
      openTable: openTableMock,
      createEmptyTable: vi.fn(),
    } as never);

    const { indexInLanceDB, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();
    await indexInLanceDB("/data", "acme-corp", "Call notes", "gmail://thread/xyz");

    expect(openTableMock).toHaveBeenCalledWith("docs_acme_corp");
    expect(chain.execute).toHaveBeenCalled();
  });

  it("uses meta defaults when date and type are absent", async () => {
    const chain = makeMergeInsertChain();
    const lancedb = await import("@lancedb/lancedb");
    vi.mocked(lancedb.connect).mockResolvedValueOnce({
      tableNames: vi.fn().mockResolvedValue(["docs_acme_corp"]),
      openTable: vi.fn().mockResolvedValue({ mergeInsert: vi.fn().mockReturnValue(chain) }),
      createEmptyTable: vi.fn(),
    } as never);

    const { indexInLanceDB, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();
    await indexInLanceDB("/data", "acme-corp", "notes", "ref://1");
    // Should not throw — defaults applied (date = today, type = "unknown")
    expect(chain.execute).toHaveBeenCalled();
  });

  it("logs stderr on error and does not throw", async () => {
    const lancedb = await import("@lancedb/lancedb");
    vi.mocked(lancedb.connect).mockRejectedValueOnce(new Error("disk full"));

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { indexInLanceDB, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();
    await expect(indexInLanceDB("/data", "acme-corp", "text", "ref://1")).resolves.toBeUndefined();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("indexInLanceDB failed"));
    stderrSpy.mockRestore();
  });
});

describe("reindexCustomer", () => {
  it("returns 0 when the table does not exist", async () => {
    const lancedb = await import("@lancedb/lancedb");
    vi.mocked(lancedb.connect).mockResolvedValueOnce({
      tableNames: vi.fn().mockResolvedValue([]),
      openTable: vi.fn(),
      createEmptyTable: vi.fn(),
    } as never);
    const { reindexCustomer, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();
    expect(await reindexCustomer("/data", "acme-corp")).toBe(0);
  });

  it("re-embeds stored rows into a freshly recreated table", async () => {
    const rows = [
      { source_ref: "gmail://1", text: "alpha", date: "2026-01-01", type: "Email" },
      { source_ref: "gmail://2", text: "beta", date: "2026-02-01", type: "Email" },
    ];
    const chain = {
      whenMatchedUpdateAll: vi.fn(),
      whenNotMatchedInsertAll: vi.fn(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    chain.whenMatchedUpdateAll.mockReturnValue(chain);
    chain.whenNotMatchedInsertAll.mockReturnValue(chain);
    const dropTable = vi.fn().mockResolvedValue(undefined);
    const createEmptyTable = vi.fn().mockResolvedValue({
      createIndex: vi.fn().mockResolvedValue(undefined),
      mergeInsert: vi.fn().mockReturnValue(chain),
    });
    const lancedb = await import("@lancedb/lancedb");
    vi.mocked(lancedb.connect).mockResolvedValueOnce({
      tableNames: vi.fn().mockResolvedValue(["docs_acme_corp"]),
      openTable: vi.fn().mockResolvedValue({
        query: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(rows) }),
        }),
      }),
      dropTable,
      createEmptyTable,
    } as never);

    const { reindexCustomer, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();
    const count = await reindexCustomer("/data", "acme-corp");

    expect(count).toBe(2);
    expect(dropTable).toHaveBeenCalledWith("docs_acme_corp");
    expect(createEmptyTable).toHaveBeenCalled();
    expect(chain.execute).toHaveBeenCalledTimes(2);
  });
});

describe("dropCustomerTable", () => {
  it("drops the table when it exists", async () => {
    const dropTableMock = vi.fn().mockResolvedValue(undefined);
    const lancedb = await import("@lancedb/lancedb");
    vi.mocked(lancedb.connect).mockResolvedValueOnce({
      tableNames: vi.fn().mockResolvedValue(["docs_acme_corp"]),
      dropTable: dropTableMock,
      openTable: vi.fn(),
      createEmptyTable: vi.fn(),
    } as never);

    const { dropCustomerTable, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();
    await dropCustomerTable("/data", "acme-corp");
    expect(dropTableMock).toHaveBeenCalledWith("docs_acme_corp");
  });

  it("does nothing when table does not exist", async () => {
    const dropTableMock = vi.fn();
    const lancedb = await import("@lancedb/lancedb");
    vi.mocked(lancedb.connect).mockResolvedValueOnce({
      tableNames: vi.fn().mockResolvedValue([]),
      dropTable: dropTableMock,
      openTable: vi.fn(),
      createEmptyTable: vi.fn(),
    } as never);

    const { dropCustomerTable, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();
    await dropCustomerTable("/data", "nonexistent-corp");
    expect(dropTableMock).not.toHaveBeenCalled();
  });

  it("logs stderr on error and does not throw", async () => {
    const lancedb = await import("@lancedb/lancedb");
    vi.mocked(lancedb.connect).mockRejectedValueOnce(new Error("connection lost"));

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { dropCustomerTable, resetConnection } = await import("../../src/core/lancedb.js");
    resetConnection();
    await expect(dropCustomerTable("/data", "acme-corp")).resolves.toBeUndefined();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("dropCustomerTable failed"));
    stderrSpy.mockRestore();
  });
});

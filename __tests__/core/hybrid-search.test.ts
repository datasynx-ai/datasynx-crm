import { describe, it, expect } from "vitest";
import { keywordRank, reciprocalRankFusion, hybridSearch } from "../../src/core/hybrid-search.js";

const DOCS = [
  { id: "a", text: "Acme renewal invoice billing terms" },
  { id: "b", text: "Beta integration bug in the API" },
  { id: "c", text: "general meeting notes about pricing" },
];

describe("keywordRank", () => {
  it("ranks documents by query term overlap, dropping non-matches", () => {
    const ranked = keywordRank("invoice billing", DOCS);
    expect(ranked[0]).toBe("a");
    expect(ranked).not.toContain("b");
  });
});

describe("reciprocalRankFusion", () => {
  it("ranks an item appearing high in multiple lists first", () => {
    const fused = reciprocalRankFusion([
      ["a", "b", "c"],
      ["b", "a", "c"],
    ]);
    // 'a' and 'b' both appear high; 'a' is rank0+rank1, 'b' rank1+rank0 → tie, then 'c' last
    expect(fused[fused.length - 1]!.id).toBe("c");
    expect(
      fused
        .slice(0, 2)
        .map((f) => f.id)
        .sort()
    ).toEqual(["a", "b"]);
  });
});

describe("hybridSearch", () => {
  it("fuses keyword ranking with a provided vector ranking", () => {
    // vector says b is most relevant; keyword says a (for 'billing')
    const res = hybridSearch("billing", DOCS, { vectorRanking: ["b", "a", "c"], limit: 3 });
    const ids = res.map((r) => r.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(res[0]!.score).toBeGreaterThan(0);
  });

  it("works keyword-only when no vector ranking is supplied", () => {
    const res = hybridSearch("integration bug", DOCS);
    expect(res[0]!.id).toBe("b");
  });
});

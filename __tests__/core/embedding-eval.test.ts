import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  recallAtK,
  reciprocalRank,
  evaluateEmbeddings,
  type EvalFixtures,
} from "../../src/core/embedding-eval.js";

describe("cosineSimilarity", () => {
  it("is 1 for identical direction and 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("is 0 when a vector is all zeros", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("recallAtK", () => {
  it("counts relevant ids within the top k", () => {
    expect(recallAtK(["a", "b", "c", "d"], ["b", "d"], 3)).toBe(0.5); // only b in top3
    expect(recallAtK(["a", "b", "c", "d"], ["b", "d"], 4)).toBe(1);
  });
  it("is 0 when there are no relevant ids", () => {
    expect(recallAtK(["a"], [], 3)).toBe(0);
  });
});

describe("reciprocalRank", () => {
  it("is 1/rank of the first relevant hit", () => {
    expect(reciprocalRank(["a", "b", "c"], ["b"])).toBeCloseTo(1 / 2);
    expect(reciprocalRank(["a", "b", "c"], ["a"])).toBeCloseTo(1);
    expect(reciprocalRank(["a", "b"], ["z"])).toBe(0);
  });
});

describe("evaluateEmbeddings", () => {
  it("ranks by cosine and aggregates recall@k and MRR", async () => {
    // Deterministic toy embedder: map words to fixed 2-D vectors.
    const vectors: Record<string, number[]> = {
      pricing: [1, 0],
      invoice: [0.9, 0.1],
      weather: [0, 1],
    };
    const embed = async (text: string): Promise<number[]> => {
      const key = Object.keys(vectors).find((w) => text.includes(w)) ?? "weather";
      return vectors[key]!;
    };

    const fixtures: EvalFixtures = {
      documents: [
        { id: "d1", text: "pricing discussion" },
        { id: "d2", text: "invoice terms" },
        { id: "d3", text: "weather chat" },
      ],
      queries: [{ query: "pricing", relevantIds: ["d1"] }],
    };

    const report = await evaluateEmbeddings(fixtures, embed, 2, "toy");
    expect(report.model).toBe("toy");
    expect(report.queries).toBe(1);
    // d1 (pricing) ranks first → recall@2 = 1, RR = 1.
    expect(report.perQuery[0]?.ranked[0]).toBe("d1");
    expect(report.meanRecallAtK).toBe(1);
    expect(report.mrr).toBeCloseTo(1);
  });

  it("handles an empty query set without dividing by zero", async () => {
    const report = await evaluateEmbeddings(
      { documents: [{ id: "d1", text: "x" }], queries: [] },
      async () => [1, 0],
      5
    );
    expect(report.queries).toBe(0);
    expect(report.meanRecallAtK).toBe(0);
    expect(report.mrr).toBe(0);
  });
});

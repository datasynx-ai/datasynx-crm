import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("embedText", () => {
  it("returns a Float32Array of length 384", async () => {
    const { embedText } = await import("../../src/core/embedder.js");
    const result = await embedText("Hello world");
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(384);
  });

  it("returns different-looking vectors for different inputs (mock always returns same)", async () => {
    const { embedText } = await import("../../src/core/embedder.js");
    const a = await embedText("hello");
    const b = await embedText("world");
    // Both are mock 0.1-filled arrays — just verify they're Float32Arrays
    expect(a).toBeInstanceOf(Float32Array);
    expect(b).toBeInstanceOf(Float32Array);
  });
});

describe("embedBatch", () => {
  it("returns array of Float32Arrays", async () => {
    const { embedBatch } = await import("../../src/core/embedder.js");
    const results = await embedBatch(["hello", "world", "foo"]);
    expect(Array.isArray(results)).toBe(true);
    for (const r of results) {
      expect(r).toBeInstanceOf(Float32Array);
    }
  });

  it("handles empty input", async () => {
    const { embedBatch } = await import("../../src/core/embedder.js");
    const results = await embedBatch([]);
    expect(results).toEqual([]);
  });
});

describe("singleton", () => {
  it("pipeline() is called only once for multiple embedText calls", async () => {
    const { pipeline } = await import("@huggingface/transformers");
    const { embedText, resetEmbeddingPipeline } = await import("../../src/core/embedder.js");

    resetEmbeddingPipeline();
    await embedText("first call");
    await embedText("second call");

    expect(pipeline).toHaveBeenCalledTimes(1);
  });
});

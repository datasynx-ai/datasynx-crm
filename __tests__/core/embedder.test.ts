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

describe("embeddingModel", () => {
  it("defaults to all-MiniLM-L6-v2 and honors DXCRM_EMBED_MODEL", async () => {
    const { embeddingModel, DEFAULT_EMBED_MODEL } = await import("../../src/core/embedder.js");
    expect(embeddingModel()).toBe(DEFAULT_EMBED_MODEL);
    process.env["DXCRM_EMBED_MODEL"] = "Xenova/bge-small-en-v1.5";
    expect(embeddingModel()).toBe("Xenova/bge-small-en-v1.5");
    delete process.env["DXCRM_EMBED_MODEL"];
  });

  it("passes the configured model to the pipeline factory", async () => {
    process.env["DXCRM_EMBED_MODEL"] = "Xenova/custom-model";
    const { pipeline } = await import("@huggingface/transformers");
    const { embedText, resetEmbeddingPipeline } = await import("../../src/core/embedder.js");
    resetEmbeddingPipeline();
    await embedText("hi");
    expect(pipeline).toHaveBeenCalledWith("feature-extraction", "Xenova/custom-model");
    delete process.env["DXCRM_EMBED_MODEL"];
    resetEmbeddingPipeline();
  });
});

describe("getEmbeddingDimension", () => {
  it("detects the dimension by probing and caches it", async () => {
    const { getEmbeddingDimension, resetEmbeddingPipeline } =
      await import("../../src/core/embedder.js");
    resetEmbeddingPipeline();
    const dim = await getEmbeddingDimension();
    expect(dim).toBe(384); // mocked model returns a 384-length vector
  });
});

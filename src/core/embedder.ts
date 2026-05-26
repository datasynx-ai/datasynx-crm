import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";
import path from "path";
import os from "os";

env.cacheDir =
  process.env["HF_CACHE_DIR"] ??
  path.join(os.homedir(), ".cache", "datasynx-opencrm", "models");

class EmbeddingPipeline {
  private static instance: Promise<FeatureExtractionPipeline> | null = null;

  static get(): Promise<FeatureExtractionPipeline> {
    if (!this.instance) {
      console.error("Loading embedding model (first time, ~25MB)...");
      this.instance = pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2"
      ) as Promise<FeatureExtractionPipeline>;
    }
    return this.instance;
  }

  static reset(): void {
    this.instance = null;
  }
}

export async function embedText(text: string): Promise<Float32Array> {
  const extractor = await EmbeddingPipeline.get();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return (output as unknown as Array<{ data: Float32Array }>)[0]?.data ?? new Float32Array(384);
}

export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const extractor = await EmbeddingPipeline.get();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return (output as unknown as Array<{ data: Float32Array }>).map(
    (o) => o.data ?? new Float32Array(384)
  );
}

export function resetEmbeddingPipeline(): void {
  EmbeddingPipeline.reset();
}

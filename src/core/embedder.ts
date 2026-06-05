import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";
import path from "path";
import os from "os";

env.cacheDir =
  process.env["HF_CACHE_DIR"] ?? path.join(os.homedir(), ".cache", "datasynx-opencrm", "models");

/** Default local embedding model. Override with DXCRM_EMBED_MODEL. */
export const DEFAULT_EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";

/** Dimension of the default model — used only as a last-resort fallback. */
const DEFAULT_EMBED_DIM = 384;

/** The embedding model in effect for this process (env-overridable). */
export function embeddingModel(): string {
  return process.env["DXCRM_EMBED_MODEL"] ?? DEFAULT_EMBED_MODEL;
}

class EmbeddingPipeline {
  private static instance: Promise<FeatureExtractionPipeline> | null = null;
  private static model: string | null = null;

  static get(): Promise<FeatureExtractionPipeline> {
    const model = embeddingModel();
    // Rebuild if the configured model changed (e.g. during evaluation).
    if (!this.instance || this.model !== model) {
      console.error(`Loading embedding model '${model}' (first use)...`);
      this.model = model;
      this.instance = pipeline("feature-extraction", model) as Promise<FeatureExtractionPipeline>;
    }
    return this.instance;
  }

  static reset(): void {
    this.instance = null;
    this.model = null;
  }
}

export async function embedText(text: string): Promise<Float32Array> {
  const extractor = await EmbeddingPipeline.get();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return (
    (output as unknown as Array<{ data: Float32Array }>)[0]?.data ??
    new Float32Array(DEFAULT_EMBED_DIM)
  );
}

export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const extractor = await EmbeddingPipeline.get();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return (output as unknown as Array<{ data: Float32Array }>).map(
    (o) => o.data ?? new Float32Array(DEFAULT_EMBED_DIM)
  );
}

let _dim: number | null = null;

/**
 * Embedding dimension of the configured model, detected once by probing a
 * sample embedding and cached. Lets the vector store size its schema to
 * whatever model is in effect instead of hard-coding 384 — so swapping in a
 * 768-dim model (bge-base, nomic) needs no code change, only a reindex.
 */
export async function getEmbeddingDimension(): Promise<number> {
  if (_dim === null) {
    const probe = await embedText("dimension probe");
    _dim = probe.length || DEFAULT_EMBED_DIM;
  }
  return _dim;
}

export function resetEmbeddingPipeline(): void {
  EmbeddingPipeline.reset();
  _dim = null;
}

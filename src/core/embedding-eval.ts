/**
 * Embedding evaluation harness (Step 5): measures retrieval quality of the
 * configured embedding model against a labeled fixture set, so swapping models
 * is a data-driven decision (recall@k, MRR) rather than a blind change. Pure
 * and offline — the embed function is injected, so the metric math is testable
 * without loading a model.
 */
export interface EvalDoc {
  id: string;
  text: string;
}

export interface EvalQuery {
  query: string;
  /** Ids of the documents that are genuinely relevant to this query. */
  relevantIds: string[];
}

export interface EvalFixtures {
  documents: EvalDoc[];
  queries: EvalQuery[];
}

export interface EvalReport {
  model: string;
  queries: number;
  k: number;
  meanRecallAtK: number;
  mrr: number;
  perQuery: Array<{
    query: string;
    recallAtK: number;
    reciprocalRank: number;
    ranked: string[];
  }>;
}

export type EmbedFn = (text: string) => Promise<Float32Array | number[]>;

/** Cosine similarity; robust to non-normalized vectors. */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Fraction of the relevant documents that appear in the top-k ranked ids. */
export function recallAtK(ranked: string[], relevant: string[], k: number): number {
  if (relevant.length === 0) return 0;
  const top = new Set(ranked.slice(0, k));
  const hits = relevant.filter((id) => top.has(id)).length;
  return hits / relevant.length;
}

/** Reciprocal rank of the first relevant id (0 if none present). */
export function reciprocalRank(ranked: string[], relevant: string[]): number {
  const rel = new Set(relevant);
  for (let i = 0; i < ranked.length; i++) {
    if (rel.has(ranked[i]!)) return 1 / (i + 1);
  }
  return 0;
}

export async function evaluateEmbeddings(
  fixtures: EvalFixtures,
  embed: EmbedFn,
  k = 5,
  model = "unknown"
): Promise<EvalReport> {
  const docVecs = new Map<string, number[]>();
  for (const d of fixtures.documents) {
    docVecs.set(d.id, Array.from(await embed(d.text)));
  }

  const perQuery: EvalReport["perQuery"] = [];
  let sumRecall = 0;
  let sumRR = 0;

  for (const q of fixtures.queries) {
    const qv = Array.from(await embed(q.query));
    const ranked = [...docVecs.entries()]
      .map(([id, v]) => ({ id, score: cosineSimilarity(qv, v) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.id);
    const recall = recallAtK(ranked, q.relevantIds, k);
    const rr = reciprocalRank(ranked, q.relevantIds);
    sumRecall += recall;
    sumRR += rr;
    perQuery.push({ query: q.query, recallAtK: recall, reciprocalRank: rr, ranked });
  }

  const n = fixtures.queries.length || 1;
  return {
    model,
    queries: fixtures.queries.length,
    k,
    meanRecallAtK: sumRecall / n,
    mrr: sumRR / n,
    perQuery,
  };
}

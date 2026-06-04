/**
 * Hybrid search (domino D2 / F8): combines keyword ranking with an externally
 * supplied vector ranking (e.g. from LanceDB `searchKnowledge`) via Reciprocal
 * Rank Fusion (RRF). RRF needs no score normalization and is robust across
 * heterogeneous scorers. The shared retrieval foundation for memories (D6),
 * SOPs (D7), KB and "Ask your CRM" (D10).
 */
export interface HybridDoc {
  id: string;
  text: string;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/** Rank doc ids by query-term overlap (term frequency), dropping zero-overlap docs. */
export function keywordRank(query: string, docs: HybridDoc[]): string[] {
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0) return [];
  const scored = docs
    .map((d) => {
      const docTokens = tokenize(d.text);
      let score = 0;
      for (const t of docTokens) if (qTokens.has(t)) score++;
      return { id: d.id, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((s) => s.id);
}

/** Reciprocal Rank Fusion of multiple ranked id-lists. Higher score = better. */
export function reciprocalRankFusion(
  rankings: string[][],
  k = 60
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

export interface HybridOptions {
  vectorRanking?: string[];
  limit?: number;
  k?: number;
}

/** Hybrid search: fuse keyword ranking with an optional vector ranking. */
export function hybridSearch(
  query: string,
  docs: HybridDoc[],
  opts: HybridOptions = {}
): Array<{ id: string; score: number }> {
  const rankings: string[][] = [keywordRank(query, docs)];
  if (opts.vectorRanking && opts.vectorRanking.length > 0) rankings.push(opts.vectorRanking);
  const fused = reciprocalRankFusion(rankings, opts.k ?? 60);
  return opts.limit ? fused.slice(0, opts.limit) : fused;
}

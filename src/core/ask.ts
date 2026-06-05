import { hybridSearch, reciprocalRankFusion, type HybridDoc } from "./hybrid-search.js";
import { searchKnowledge } from "./lancedb.js";
import { loadMemories } from "./memory.js";
import { loadSops } from "./sop.js";
import { readInteractions } from "../fs/interactions-writer.js";
import { readPipeline } from "../fs/pipeline-writer.js";

/**
 * Ask-your-CRM (domino D10 / C2): natural-language Q&A over CRM data. Interactions
 * are retrieved through the indexed hybrid path (LanceDB BM25 + vector, see
 * `searchKnowledge`); the small, structured sources (memories, SOPs, pipeline) are
 * ranked in-memory by keyword. The two ranked lists are fused via Reciprocal Rank
 * Fusion. When a customer's interactions are not yet indexed, the in-memory
 * markdown is used as a fallback so nothing becomes unsearchable. When an LLM is
 * available the top snippets are synthesized into a grounded answer; otherwise the
 * ranked sources are returned (still useful).
 */
export interface AskResult {
  answer?: string;
  sources: Array<{ id: string; text: string }>;
}

export interface GatherCorpusOptions {
  /** Include interactions from the markdown file (in-memory fallback). Default true. */
  includeInteractions?: boolean;
}

export async function gatherCorpus(
  dataDir: string,
  slug?: string,
  opts: GatherCorpusOptions = {}
): Promise<HybridDoc[]> {
  const includeInteractions = opts.includeInteractions ?? true;
  const docs: HybridDoc[] = [];

  for (const m of loadMemories(dataDir, slug)) docs.push({ id: `mem:${m.id}`, text: m.text });
  for (const s of loadSops(dataDir, slug))
    docs.push({ id: `sop:${s.id}`, text: `${s.title} ${s.triggers.join(" ")} ${s.body}` });

  if (slug) {
    if (includeInteractions) {
      const interactions = await readInteractions(dataDir, slug).catch(() => "");
      interactions
        .split(/(?=^## )/m)
        .map((e) => e.trim())
        .filter((e) => e && !e.startsWith("# "))
        .forEach((e, i) => docs.push({ id: `int:${slug}:${i}`, text: e }));
    }

    const deals = await readPipeline(dataDir, slug).catch(() => []);
    for (const d of deals)
      docs.push({
        id: `deal:${d.name}`,
        text: `${d.name} stage ${d.stage} value ${d.value ?? ""} ${d.notes ?? ""}`,
      });
  }

  return docs;
}

const TOP_K = 6;

export async function askCrm(dataDir: string, question: string, slug?: string): Promise<AskResult> {
  // Interactions via the indexed hybrid path (BM25 + vector), when available.
  const lanceRanking: string[] = [];
  const lanceTextById = new Map<string, string>();
  if (slug) {
    const hits = await searchKnowledge(dataDir, slug, question, TOP_K).catch(() => []);
    for (const h of hits) {
      const id = `lance:${h.source}`;
      lanceRanking.push(id);
      if (!lanceTextById.has(id)) lanceTextById.set(id, h.content);
    }
  }

  // Small structured sources in-memory; interactions only as fallback when the
  // indexed path returned nothing (so manually-logged, un-indexed entries still
  // surface and the "empty on no match" contract holds).
  const corpus = await gatherCorpus(dataDir, slug, {
    includeInteractions: lanceRanking.length === 0,
  });
  const memById = new Map(corpus.map((d) => [d.id, d]));
  const memRanking = hybridSearch(question, corpus, { limit: TOP_K }).map((r) => r.id);

  // Fuse the two disjoint ranked lists via RRF (k=60 default).
  const rankings = [memRanking, lanceRanking].filter((r) => r.length > 0);
  const fused = rankings.length > 0 ? reciprocalRankFusion(rankings) : [];

  const sources = fused
    .map(({ id }) => ({ id, text: lanceTextById.get(id) ?? memById.get(id)?.text }))
    .filter((s): s is { id: string; text: string } => Boolean(s.text))
    .slice(0, TOP_K);

  if (sources.length === 0) return { sources: [] };

  try {
    const { callLlm } = await import("./llm.js");
    const context = sources.map((s, i) => `[${i + 1}] ${s.text}`).join("\n");
    const answer = await callLlm(
      `Answer the question using ONLY the context. Cite snippet numbers. If unknown, say so.\n\n` +
        `Question: ${question}\n\nContext:\n${context}`,
      { tool: "ask_crm", ...(slug ? { slug } : {}) }
    );
    return { answer, sources };
  } catch {
    return { sources };
  }
}

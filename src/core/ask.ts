import { hybridSearch, type HybridDoc } from "./hybrid-search.js";
import { loadMemories } from "./memory.js";
import { loadSops } from "./sop.js";
import { readInteractions } from "../fs/interactions-writer.js";
import { readPipeline } from "../fs/pipeline-writer.js";

/**
 * Ask-your-CRM (domino D10 / C2): natural-language Q&A over CRM data. Gathers a
 * corpus (interactions, pipeline, memories, SOPs), retrieves relevant snippets
 * via hybrid search, and — when an LLM is available — synthesizes a grounded
 * answer. Without an LLM it returns the ranked sources (still useful).
 */
export interface AskResult {
  answer?: string;
  sources: Array<{ id: string; text: string }>;
}

export async function gatherCorpus(dataDir: string, slug?: string): Promise<HybridDoc[]> {
  const docs: HybridDoc[] = [];

  for (const m of loadMemories(dataDir, slug)) docs.push({ id: `mem:${m.id}`, text: m.text });
  for (const s of loadSops(dataDir, slug))
    docs.push({ id: `sop:${s.id}`, text: `${s.title} ${s.triggers.join(" ")} ${s.body}` });

  if (slug) {
    const interactions = await readInteractions(dataDir, slug).catch(() => "");
    interactions
      .split(/(?=^## )/m)
      .map((e) => e.trim())
      .filter((e) => e && !e.startsWith("# "))
      .forEach((e, i) => docs.push({ id: `int:${slug}:${i}`, text: e }));

    const deals = await readPipeline(dataDir, slug).catch(() => []);
    for (const d of deals)
      docs.push({
        id: `deal:${d.name}`,
        text: `${d.name} stage ${d.stage} value ${d.value ?? ""} ${d.notes ?? ""}`,
      });
  }

  return docs;
}

export async function askCrm(dataDir: string, question: string, slug?: string): Promise<AskResult> {
  const corpus = await gatherCorpus(dataDir, slug);
  const ranked = hybridSearch(question, corpus, { limit: 6 });
  const byId = new Map(corpus.map((d) => [d.id, d]));
  const sources = ranked.map((r) => byId.get(r.id)!).filter(Boolean);

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

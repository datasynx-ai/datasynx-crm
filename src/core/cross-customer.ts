import { searchKnowledge } from "./lancedb.js";
import { listCustomerSlugs } from "../fs/customer-dir.js";

export interface CrossCustomerResult {
  slug: string;
  relevantContent: string;
  score: number;
}

export async function searchAcrossCustomers(
  dataDir: string,
  query: string,
  limit = 5,
  excludeSlug?: string
): Promise<CrossCustomerResult[]> {
  const slugs = listCustomerSlugs(dataDir).filter((d) => d !== excludeSlug);

  const allResults: CrossCustomerResult[] = [];

  for (const slug of slugs) {
    const results = await searchKnowledge(dataDir, slug, query, 2);
    for (const r of results) {
      allResults.push({
        slug,
        relevantContent: r.content.slice(0, 200),
        score: r.score,
      });
    }
  }

  return allResults.sort((a, b) => b.score - a.score).slice(0, limit);
}

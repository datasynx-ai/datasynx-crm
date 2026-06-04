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

  // Each customer's vector search is independent — fan out in parallel rather
  // than awaiting one LanceDB query at a time (latency was linear in #customers).
  const perCustomer = await Promise.all(
    slugs.map(async (slug) => {
      const results = await searchKnowledge(dataDir, slug, query, 2);
      return results.map((r) => ({
        slug,
        relevantContent: r.content.slice(0, 200),
        score: r.score,
      }));
    })
  );

  return perCustomer
    .flat()
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

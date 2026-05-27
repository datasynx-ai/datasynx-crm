import { searchKnowledge } from "./lancedb.js";
import fs from "fs";
import path from "path";

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
  const customersDir = path.join(dataDir, "customers");
  if (!fs.existsSync(customersDir)) return [];

  const slugs = fs.readdirSync(customersDir).filter(
    (d) => d !== excludeSlug && fs.statSync(path.join(customersDir, d)).isDirectory()
  );

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

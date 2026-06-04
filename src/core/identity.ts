import fs from "fs";
import path from "path";
import { readMainFacts } from "../fs/customer-dir.js";

/**
 * Identity resolution (CDP v1, N4-3): deterministic deduplication of customers
 * by a canonical key (normalized domain, falling back to email domain). Reports
 * clusters of likely-duplicate customers so they can be merged.
 */
export function normalizeDomain(value: string): string {
  let v = value.trim().toLowerCase();
  if (v.includes("@")) v = v.split("@").pop() ?? v; // email -> domain
  v = v.replace(/^https?:\/\//, "").replace(/^www\./, "");
  v = v.replace(/\/.*$/, ""); // drop path
  return v;
}

export interface DuplicateCluster {
  key: string;
  slugs: string[];
}

function listSlugs(dataDir: string): string[] {
  const dir = path.join(dataDir, "customers");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((s) => {
    try {
      return fs.statSync(path.join(dir, s)).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Canonical key for a customer: normalized domain, else email domain, else "". */
export async function canonicalKey(dataDir: string, slug: string): Promise<string> {
  const facts = await readMainFacts(dataDir, slug).catch(() => null);
  if (!facts) return "";
  if (facts.domain) return normalizeDomain(facts.domain);
  if (facts.email) return normalizeDomain(facts.email);
  return "";
}

/** Group customers by canonical key; clusters with ≥2 members are duplicates. */
export async function findDuplicateClusters(dataDir: string): Promise<DuplicateCluster[]> {
  const byKey = new Map<string, string[]>();
  for (const slug of listSlugs(dataDir)) {
    const key = await canonicalKey(dataDir, slug);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), slug]);
  }
  const clusters: DuplicateCluster[] = [];
  for (const [key, slugs] of byKey) {
    if (slugs.length >= 2) clusters.push({ key, slugs });
  }
  return clusters;
}

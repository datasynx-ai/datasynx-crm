import { randomBytes } from "crypto";
import path from "path";
import { hybridSearch } from "./hybrid-search.js";
import { readJsonArray, writeJsonArray } from "../fs/json-store.js";

/**
 * SOP module (domino D7 / F5): Standard Operating Procedures — procedural
 * instructions, global or per customer, found via hybrid search to guide task
 * execution ("how we do X"). Customer-specific SOPs take precedence over global.
 */
export interface Sop {
  id: string;
  scope: "global" | "customer";
  slug?: string;
  title: string;
  triggers: string[];
  tags?: string[];
  body: string;
  createdAt: string;
}

function globalPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "sops.json");
}
function customerPath(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug, "sops.json");
}

function readFile(p: string): Sop[] {
  return readJsonArray<Sop>(p, "sops");
}
function writeFile(p: string, sops: Sop[]): void {
  writeJsonArray(p, "sops", sops);
}

export function addSop(
  dataDir: string,
  s: {
    scope: "global" | "customer";
    slug?: string;
    title: string;
    triggers: string[];
    tags?: string[];
    body: string;
  }
): Sop {
  const sop: Sop = {
    id: `sop_${randomBytes(5).toString("hex")}`,
    scope: s.scope,
    ...(s.slug ? { slug: s.slug } : {}),
    title: s.title,
    triggers: s.triggers,
    ...(s.tags ? { tags: s.tags } : {}),
    body: s.body,
    createdAt: new Date().toISOString(),
  };
  const p = s.scope === "global" ? globalPath(dataDir) : customerPath(dataDir, s.slug ?? "");
  writeFile(p, [...readFile(p), sop]);
  return sop;
}

export function loadSops(dataDir: string, slug?: string): Sop[] {
  const global = readFile(globalPath(dataDir));
  if (!slug) return global;
  return [...global, ...readFile(customerPath(dataDir, slug))];
}

/**
 * Find SOPs relevant to a task. Hybrid-search over title+triggers+body; among
 * matches, customer-specific SOPs are returned before global ones.
 */
export async function findSops(dataDir: string, query: string, slug?: string): Promise<Sop[]> {
  const sops = loadSops(dataDir, slug);
  const docs = sops.map((s) => ({
    id: s.id,
    text: `${s.title} ${s.triggers.join(" ")} ${(s.tags ?? []).join(" ")} ${s.body}`,
  }));
  const ranked = hybridSearch(query, docs);
  const byId = new Map(sops.map((s) => [s.id, s]));
  const matched = ranked.map((r, i) => ({ sop: byId.get(r.id)!, rank: i })).filter((x) => x.sop);
  // Customer-scoped SOPs first, then by relevance rank.
  matched.sort((a, b) => {
    const ac = a.sop.scope === "customer" ? 0 : 1;
    const bc = b.sop.scope === "customer" ? 0 : 1;
    return ac !== bc ? ac - bc : a.rank - b.rank;
  });
  return matched.map((x) => x.sop);
}

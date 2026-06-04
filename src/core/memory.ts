import { randomBytes } from "crypto";
import path from "path";
import { hybridSearch } from "./hybrid-search.js";
import { readJsonArray, writeJsonArray } from "../fs/json-store.js";

/**
 * Agent memory (domino D6 / F4): persistent, typed memories per customer and
 * global, retrievable via hybrid search. Injected into context so the agent
 * gets durably smarter across every interaction (CoALA: semantic/procedural).
 */
export type MemoryType = "fact" | "preference" | "learning" | "instruction";

export interface MemoryEntry {
  id: string;
  scope: "global" | "customer";
  slug?: string;
  type: MemoryType;
  text: string;
  confidence?: number;
  createdAt: string;
}

function globalPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "memory", "global.json");
}
function customerPath(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug, "memory.json");
}

function readFile(p: string): MemoryEntry[] {
  return readJsonArray<MemoryEntry>(p, "memories");
}
function writeFile(p: string, memories: MemoryEntry[]): void {
  writeJsonArray(p, "memories", memories);
}

export function addMemory(
  dataDir: string,
  m: {
    scope: "global" | "customer";
    slug?: string;
    type: MemoryType;
    text: string;
    confidence?: number;
  }
): MemoryEntry {
  const entry: MemoryEntry = {
    id: `mem_${randomBytes(5).toString("hex")}`,
    scope: m.scope,
    ...(m.slug ? { slug: m.slug } : {}),
    type: m.type,
    text: m.text,
    ...(typeof m.confidence === "number" ? { confidence: m.confidence } : {}),
    createdAt: new Date().toISOString(),
  };
  const p = m.scope === "global" ? globalPath(dataDir) : customerPath(dataDir, m.slug ?? "");
  writeFile(p, [...readFile(p), entry]);
  return entry;
}

/** Load memories: global always; plus the customer's own when a slug is given. */
export function loadMemories(dataDir: string, slug?: string): MemoryEntry[] {
  const global = readFile(globalPath(dataDir));
  if (!slug) return global;
  return [...global, ...readFile(customerPath(dataDir, slug))];
}

/** Search memories by relevance (hybrid keyword ranking over memory texts). */
export async function searchMemory(
  dataDir: string,
  query: string,
  slug?: string,
  limit = 5
): Promise<MemoryEntry[]> {
  const memories = loadMemories(dataDir, slug);
  const docs = memories.map((m) => ({ id: m.id, text: m.text }));
  const ranked = hybridSearch(query, docs, { limit });
  const byId = new Map(memories.map((m) => [m.id, m]));
  return ranked.map((r) => byId.get(r.id)!).filter(Boolean);
}

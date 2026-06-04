import path from "path";
import { readMainFacts, listCustomerSlugs } from "../fs/customer-dir.js";
import { readJsonArray, writeJsonArray } from "../fs/json-store.js";

/**
 * Customer segments (marketing lists, N4-1): named filter criteria over
 * customers, evaluated on demand. Definitions live in .agentic/segments.json.
 */
export interface SegmentCriteria {
  stage?: string;
  tags?: string[];
  minDealValue?: number;
  staleDays?: number;
}

export interface SegmentDefinition {
  name: string;
  criteria: SegmentCriteria;
}

function segmentsPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "segments.json");
}

export function loadSegments(dataDir: string): SegmentDefinition[] {
  return readJsonArray<SegmentDefinition>(segmentsPath(dataDir), "segments");
}

export function defineSegment(
  dataDir: string,
  name: string,
  criteria: SegmentCriteria
): SegmentDefinition[] {
  const segs = loadSegments(dataDir);
  const idx = segs.findIndex((s) => s.name === name);
  const def: SegmentDefinition = { name, criteria };
  if (idx >= 0) segs[idx] = def;
  else segs.push(def);
  writeJsonArray(segmentsPath(dataDir), "segments", segs);
  return segs;
}

export function removeSegment(dataDir: string, name: string): boolean {
  const segs = loadSegments(dataDir);
  const next = segs.filter((s) => s.name !== name);
  if (next.length === segs.length) return false;
  writeJsonArray(segmentsPath(dataDir), "segments", next);
  return true;
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

/** Return the customer slugs matching the criteria (now defaults to today). */
export async function evaluateSegment(
  dataDir: string,
  criteria: SegmentCriteria,
  now: string = new Date().toISOString().slice(0, 10)
): Promise<string[]> {
  const matches: string[] = [];
  for (const slug of listCustomerSlugs(dataDir)) {
    const facts = await readMainFacts(dataDir, slug).catch(() => null);
    if (!facts) continue;

    if (criteria.stage && facts.relationship_stage !== criteria.stage) continue;
    if (
      criteria.minDealValue !== undefined &&
      !(typeof facts.deal_value === "number" && facts.deal_value >= criteria.minDealValue)
    ) {
      continue;
    }
    if (criteria.tags && criteria.tags.length > 0) {
      const tags = facts.tags ?? [];
      if (!criteria.tags.every((t) => tags.includes(t))) continue;
    }
    if (criteria.staleDays !== undefined) {
      // `updated` is the recency proxy (last record change).
      const lt = facts.updated;
      if (!lt || daysBetween(lt, now) < criteria.staleDays) continue;
    }
    matches.push(slug);
  }
  return matches;
}

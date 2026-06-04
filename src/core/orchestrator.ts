import path from "path";
import { readJsonArray, writeJsonArray } from "../fs/json-store.js";

/**
 * Multi-agent orchestration (N6-2 v1): a registry of specialist subagents and
 * topic-based handoff routing, plus an auditable handoff log. The orchestrator
 * decides which subagent should handle a task; the actual agent run is driven
 * by the host (Claude Agent SDK / Mastra / Hermes).
 */
export interface Subagent {
  name: string;
  topics: string[];
  description?: string;
}

export interface Handoff {
  from: string;
  to: string;
  task: string;
  at?: string;
}

/** Route a free-text task to the subagent whose topics best match it. */
export function routeToSubagent(subagents: Subagent[], task: string): string | null {
  const text = task.toLowerCase();
  let best: { name: string; score: number } | null = null;
  for (const sa of subagents) {
    const score = sa.topics.reduce((n, t) => (text.includes(t.toLowerCase()) ? n + 1 : n), 0);
    if (score > 0 && (!best || score > best.score)) best = { name: sa.name, score };
  }
  return best ? best.name : null;
}

function subagentsPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "subagents.json");
}
function handoffsPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "handoffs.json");
}

export function loadSubagents(dataDir: string): Subagent[] {
  return readJsonArray<Subagent>(subagentsPath(dataDir), "subagents");
}

export function saveSubagents(dataDir: string, subagents: Subagent[]): void {
  writeJsonArray(subagentsPath(dataDir), "subagents", subagents);
}

export function loadHandoffs(dataDir: string): Handoff[] {
  return readJsonArray<Handoff>(handoffsPath(dataDir), "handoffs");
}

export function recordHandoff(dataDir: string, handoff: Handoff): void {
  const log = loadHandoffs(dataDir);
  log.push({ ...handoff, at: handoff.at ?? new Date().toISOString() });
  writeJsonArray(handoffsPath(dataDir), "handoffs", log);
}

import fs from "fs";
import path from "path";

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
  const p = subagentsPath(dataDir);
  if (!fs.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf-8") as string) as { subagents?: Subagent[] };
    return Array.isArray(data.subagents) ? data.subagents : [];
  } catch {
    return [];
  }
}

export function saveSubagents(dataDir: string, subagents: Subagent[]): void {
  const p = subagentsPath(dataDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ subagents }, null, 2), "utf-8");
}

export function loadHandoffs(dataDir: string): Handoff[] {
  const p = handoffsPath(dataDir);
  if (!fs.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf-8") as string) as { handoffs?: Handoff[] };
    return Array.isArray(data.handoffs) ? data.handoffs : [];
  } catch {
    return [];
  }
}

export function recordHandoff(dataDir: string, handoff: Handoff): void {
  const log = loadHandoffs(dataDir);
  log.push({ ...handoff, at: handoff.at ?? new Date().toISOString() });
  const p = handoffsPath(dataDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ handoffs: log }, null, 2), "utf-8");
}

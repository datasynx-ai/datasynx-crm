import fs from "fs";
import path from "path";

/**
 * Omni-channel routing (N3-1 v1): assign work (tickets) to agents by skill,
 * availability and current load. Agents live in .agentic/routing-agents.json.
 */
export interface RoutingAgent {
  name: string;
  skills: string[];
  available: boolean;
  load?: number;
}

export interface RouteOptions {
  skill?: string;
}

/** Pick the best agent: available, has the skill (if required), least loaded. */
export function routeTicket(agents: RoutingAgent[], opts: RouteOptions): string | null {
  const candidates = agents.filter(
    (a) => a.available && (!opts.skill || a.skills.includes(opts.skill))
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.load ?? 0) - (b.load ?? 0));
  return candidates[0]!.name;
}

function agentsPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "routing-agents.json");
}

export function loadRoutingAgents(dataDir: string): RoutingAgent[] {
  const p = agentsPath(dataDir);
  if (!fs.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf-8") as string) as { agents?: RoutingAgent[] };
    return Array.isArray(data.agents) ? data.agents : [];
  } catch {
    return [];
  }
}

export function saveRoutingAgents(dataDir: string, agents: RoutingAgent[]): void {
  const p = agentsPath(dataDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ agents }, null, 2), "utf-8");
}

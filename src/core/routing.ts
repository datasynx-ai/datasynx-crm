import path from "path";
import { readJsonArray, writeJsonArray } from "../fs/json-store.js";

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
  return readJsonArray<RoutingAgent>(agentsPath(dataDir), "agents");
}

export function saveRoutingAgents(dataDir: string, agents: RoutingAgent[]): void {
  writeJsonArray(agentsPath(dataDir), "agents", agents);
}

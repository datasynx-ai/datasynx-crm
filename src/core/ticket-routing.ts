import path from "path";
import { randomBytes } from "crypto";
import { readJsonArray, writeJsonArray } from "../fs/json-store.js";
import { loadRoutingAgents, saveRoutingAgents, routeTicket } from "./routing.js";

/**
 * Rule-based ticket routing (#59): `.agentic/routing.json` maps customer /
 * priority / tag to an assignee, a required skill (resolved via the routing
 * agents' skills + load), or round-robin. First matching rule wins.
 */
export interface RoutingRule {
  id: string;
  /** All given match fields must apply (AND). Empty match = catch-all. */
  match: { slug?: string; priority?: string; tag?: string };
  /** Exactly one assignment strategy. */
  assign: { assignee?: string; skill?: string; roundRobin?: boolean };
  createdAt: string;
}

function rulesPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "routing.json");
}

export function loadRoutingRules(dataDir: string): RoutingRule[] {
  return readJsonArray<RoutingRule>(rulesPath(dataDir), "rules");
}

export function addRoutingRule(
  dataDir: string,
  rule: Omit<RoutingRule, "id" | "createdAt">
): RoutingRule {
  const full: RoutingRule = {
    ...rule,
    id: `rr_${randomBytes(4).toString("hex")}`,
    createdAt: new Date().toISOString(),
  };
  writeJsonArray(rulesPath(dataDir), "rules", [...loadRoutingRules(dataDir), full]);
  return full;
}

function ruleMatches(
  rule: RoutingRule,
  ctx: { slug: string; priority: string; tags?: string[] }
): boolean {
  if (rule.match.slug && rule.match.slug !== ctx.slug) return false;
  if (rule.match.priority && rule.match.priority !== ctx.priority) return false;
  if (rule.match.tag && !(ctx.tags ?? []).includes(rule.match.tag)) return false;
  return true;
}

/**
 * Resolve the assignee for a new ticket. Returns null when no rule matches or
 * no agent is available. Round-robin / skill routing increments the chosen
 * agent's load so the next ticket goes elsewhere.
 */
export function resolveAssignee(
  dataDir: string,
  ctx: { slug: string; priority: string; tags?: string[]; excludeAssignee?: string }
): string | null {
  const rule = loadRoutingRules(dataDir).find((r) => ruleMatches(r, ctx));
  if (!rule) return null;

  if (rule.assign.assignee) {
    return rule.assign.assignee !== ctx.excludeAssignee ? rule.assign.assignee : null;
  }

  const agents = loadRoutingAgents(dataDir).filter((a) => a.name !== ctx.excludeAssignee);
  const picked = routeTicket(agents, rule.assign.skill ? { skill: rule.assign.skill } : {});
  if (!picked) return null;

  // Increment load so round-robin/least-load rotates.
  const all = loadRoutingAgents(dataDir).map((a) =>
    a.name === picked ? { ...a, load: (a.load ?? 0) + 1 } : a
  );
  saveRoutingAgents(dataDir, all);
  return picked;
}

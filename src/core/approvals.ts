import { randomBytes } from "crypto";
import path from "path";
import { readJsonFile, writeJsonFile, readJsonArray, writeJsonArray } from "../fs/json-store.js";

/**
 * Human-in-the-loop / approval gate (domino D4 / F3). A per-tool, per-customer
 * autonomy policy (auto | approve | block) decides whether an agent action runs
 * immediately, is queued for human approval, or is blocked. The generic gate
 * wraps any write/automation action so later features get HITL for free.
 */
export type Policy = "auto" | "approve" | "block";

interface PolicyConfig {
  default?: Policy;
  tools?: Record<string, Policy>;
  customers?: Record<string, Record<string, Policy>>;
}

export interface Approval {
  id: string;
  tool: string;
  slug?: string;
  payload: unknown;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  decidedAt?: string;
}

function policyPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "policy.json");
}
function approvalsPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "approvals.json");
}

function loadPolicyConfig(dataDir: string): PolicyConfig {
  return readJsonFile<PolicyConfig>(policyPath(dataDir), {});
}

/** Resolve the effective policy: customer-specific → global tool → default (auto). */
export function getPolicy(dataDir: string, tool: string, slug?: string): Policy {
  const cfg = loadPolicyConfig(dataDir);
  if (slug && cfg.customers?.[slug]?.[tool]) return cfg.customers[slug]![tool]!;
  if (cfg.tools?.[tool]) return cfg.tools[tool]!;
  return cfg.default ?? "auto";
}

export function setPolicy(dataDir: string, tool: string, policy: Policy, slug?: string): void {
  const cfg = loadPolicyConfig(dataDir);
  if (slug) {
    cfg.customers = cfg.customers ?? {};
    cfg.customers[slug] = { ...(cfg.customers[slug] ?? {}), [tool]: policy };
  } else {
    cfg.tools = { ...(cfg.tools ?? {}), [tool]: policy };
  }
  writeJsonFile(policyPath(dataDir), cfg);
}

export function listApprovals(dataDir: string, status?: Approval["status"]): Approval[] {
  const list = readJsonArray<Approval>(approvalsPath(dataDir), "approvals");
  return status ? list.filter((a) => a.status === status) : list;
}

function writeApprovals(dataDir: string, approvals: Approval[]): void {
  writeJsonArray(approvalsPath(dataDir), "approvals", approvals);
}

export function requestApproval(
  dataDir: string,
  req: { tool: string; slug?: string; payload: unknown }
): Approval {
  const approval: Approval = {
    id: `apr_${randomBytes(5).toString("hex")}`,
    tool: req.tool,
    ...(req.slug ? { slug: req.slug } : {}),
    payload: req.payload,
    status: "pending",
    requestedAt: new Date().toISOString(),
  };
  writeApprovals(dataDir, [...listApprovals(dataDir), approval]);
  return approval;
}

export function decideApproval(
  dataDir: string,
  id: string,
  decision: "approved" | "rejected"
): boolean {
  const all = listApprovals(dataDir);
  const idx = all.findIndex((a) => a.id === id);
  if (idx < 0) return false;
  all[idx] = { ...all[idx]!, status: decision, decidedAt: new Date().toISOString() };
  writeApprovals(dataDir, all);
  return true;
}

export interface GateResult<T> {
  status: "executed" | "pending" | "blocked";
  result?: T;
  approvalId?: string;
}

/** Gate an action by the effective policy: run, queue for approval, or block. */
export async function gateAction<T>(
  dataDir: string,
  action: { tool: string; slug?: string; payload: unknown },
  execute: () => T | Promise<T>
): Promise<GateResult<T>> {
  const policy = getPolicy(dataDir, action.tool, action.slug);
  if (policy === "block") return { status: "blocked" };
  if (policy === "approve") {
    const approval = requestApproval(dataDir, action);
    return { status: "pending", approvalId: approval.id };
  }
  return { status: "executed", result: await execute() };
}

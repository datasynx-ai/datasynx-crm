import path from "path";
import { randomBytes } from "crypto";
import { readJsonArray, writeJsonArray } from "../fs/json-store.js";
import { getPolicy, requestApproval } from "./approvals.js";
import { writeAuditEntry } from "../fs/audit-log.js";
import { logger } from "./logger.js";

/**
 * Declarative if-then workflow automation (#48): rules in
 * `.agentic/workflows.json` react to internal events (deal.updated,
 * ticket.created, quote.accepted, email.replied, record.created, …) and run a
 * whitelisted set of actions. Every action passes the autonomy-policy gate
 * (auto | approve | block) and is audited.
 */

export type ConditionOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "exists";

export interface WorkflowCondition {
  /** Dot path into the event payload, e.g. "deal.stage" or "slug". */
  field: string;
  op: ConditionOp;
  value?: unknown;
}

export interface WorkflowAction {
  /** Whitelisted action name (see ACTION_WHITELIST). */
  tool: string;
  /** Args; string values support {{payload.path}} interpolation. */
  args: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
  /** Event name, exact ("deal.updated") or prefix wildcard ("deal.*" / "*"). */
  trigger: string;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  createdAt: string;
  lastRunAt?: string;
  runCount?: number;
}

export const ACTION_WHITELIST = [
  "enroll_in_sequence",
  "create_ticket",
  "create_task",
  "log_interaction",
  "update_deal",
  "notify",
] as const;

function workflowsPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "workflows.json");
}

export function listWorkflows(dataDir: string): Workflow[] {
  return readJsonArray<Workflow>(workflowsPath(dataDir), "workflows");
}

function writeWorkflows(dataDir: string, workflows: Workflow[]): void {
  writeJsonArray(workflowsPath(dataDir), "workflows", workflows);
}

export function saveWorkflow(
  dataDir: string,
  wf: Omit<Workflow, "id" | "createdAt"> & { id?: string }
): Workflow {
  for (const a of wf.actions) {
    if (!(ACTION_WHITELIST as readonly string[]).includes(a.tool)) {
      throw new Error(`Action '${a.tool}' is not allowed. Allowed: ${ACTION_WHITELIST.join(", ")}`);
    }
  }
  const workflow: Workflow = {
    ...wf,
    id: wf.id ?? `wf_${randomBytes(5).toString("hex")}`,
    createdAt: new Date().toISOString(),
  };
  const all = listWorkflows(dataDir).filter((w) => w.id !== workflow.id);
  writeWorkflows(dataDir, [...all, workflow]);
  return workflow;
}

export function toggleWorkflow(dataDir: string, id: string, enabled: boolean): Workflow | null {
  const all = listWorkflows(dataDir);
  const idx = all.findIndex((w) => w.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx]!, enabled };
  writeWorkflows(dataDir, all);
  return all[idx]!;
}

// ─── Matching ─────────────────────────────────────────────────────────────────

export function triggerMatches(trigger: string, event: string): boolean {
  if (trigger === "*" || trigger === event) return true;
  if (trigger.endsWith(".*")) return event.startsWith(trigger.slice(0, -1));
  return false;
}

function getPath(obj: unknown, dotPath: string): unknown {
  let cur: unknown = obj;
  for (const part of dotPath.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function evaluateCondition(cond: WorkflowCondition, payload: unknown): boolean {
  const actual = getPath(payload, cond.field);
  switch (cond.op) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "eq":
      return actual === cond.value;
    case "neq":
      return actual !== cond.value;
    case "gt":
      return typeof actual === "number" && typeof cond.value === "number" && actual > cond.value;
    case "gte":
      return typeof actual === "number" && typeof cond.value === "number" && actual >= cond.value;
    case "lt":
      return typeof actual === "number" && typeof cond.value === "number" && actual < cond.value;
    case "lte":
      return typeof actual === "number" && typeof cond.value === "number" && actual <= cond.value;
    case "contains":
      return (
        (typeof actual === "string" &&
          typeof cond.value === "string" &&
          actual.includes(cond.value)) ||
        (Array.isArray(actual) && actual.includes(cond.value))
      );
    default:
      return false;
  }
}

export function evaluateConditions(conditions: WorkflowCondition[], payload: unknown): boolean {
  return conditions.every((c) => evaluateCondition(c, payload));
}

/** Interpolate {{path}} templates in string args from the event payload. */
export function interpolateArgs(
  args: Record<string, unknown>,
  payload: unknown
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] =
      typeof v === "string"
        ? v.replace(/\{\{([^}]+)\}\}/g, (_m, p: string) => String(getPath(payload, p.trim()) ?? ""))
        : v;
  }
  return out;
}

// ─── Execution ────────────────────────────────────────────────────────────────

export interface WorkflowRunResult {
  workflowId: string;
  matched: boolean;
  actions: Array<{
    tool: string;
    status: "executed" | "pending" | "blocked" | "error";
    detail?: string;
  }>;
}

// Depth guard: actions like update_deal emit deal.updated again — nested events
// never trigger another workflow pass (outbound webhooks are unaffected).
let executionDepth = 0;

async function executeAction(
  dataDir: string,
  action: WorkflowAction,
  payload: unknown
): Promise<{ status: "executed" | "pending" | "blocked" | "error"; detail?: string }> {
  const args = interpolateArgs(action.args, payload);
  const slug = typeof args["slug"] === "string" ? (args["slug"] as string) : undefined;

  // Autonomy policy gate: approve → queue for HITL, block → skip.
  const policy = getPolicy(dataDir, action.tool, slug);
  if (policy === "block") return { status: "blocked" };
  if (policy === "approve") {
    const approval = requestApproval(dataDir, {
      tool: action.tool,
      ...(slug ? { slug } : {}),
      payload: args,
    });
    return { status: "pending", detail: approval.id };
  }

  try {
    switch (action.tool) {
      case "enroll_in_sequence": {
        const { handleEnrollInSequence } = await import("../mcp/tools/enroll-in-sequence.js");
        await handleEnrollInSequence(args as never, dataDir);
        break;
      }
      case "create_ticket": {
        const { handleCreateTicket } = await import("../mcp/tools/create-ticket.js");
        await handleCreateTicket(args as never, dataDir);
        break;
      }
      case "create_task": {
        const { handleCreateTask } = await import("../mcp/tools/create-task.js");
        await handleCreateTask(args as never, dataDir);
        break;
      }
      case "log_interaction": {
        const { handleLogInteraction } = await import("../mcp/tools/log-interaction.js");
        await handleLogInteraction(args as never, dataDir);
        break;
      }
      case "update_deal": {
        const { handleUpdateDeal } = await import("../mcp/tools/update-deal.js");
        await handleUpdateDeal(args as never, dataDir);
        break;
      }
      case "notify": {
        const { enqueueTask } = await import("./proactive-agent.js");
        await enqueueTask(dataDir, {
          type: "follow_up_nudge",
          ...(slug ? { slug } : {}),
          priority: "high",
          payload: { message: String(args["message"] ?? "Workflow notification") },
          scheduledFor: new Date().toISOString(),
          channel:
            process.env["TELEGRAM_BOT_TOKEN"] && process.env["TELEGRAM_CHAT_ID"]
              ? "telegram"
              : process.env["SLACK_WEBHOOK_URL"]
                ? "slack"
                : "mcp_tool_response",
        });
        break;
      }
      default:
        return { status: "error", detail: `unknown action '${action.tool}'` };
    }
    writeAuditEntry(dataDir, {
      timestamp: new Date().toISOString(),
      actor: "workflow",
      tool: action.tool,
      slug: slug ?? "-",
      summary: `workflow action (${action.tool})`,
    });
    return { status: "executed" };
  } catch (err) {
    return { status: "error", detail: (err as Error).message };
  }
}

/**
 * Run all enabled workflows matching `event`. With `dryRun`, conditions are
 * evaluated but no action is executed (and counters stay untouched).
 */
export async function runWorkflowsForEvent(
  dataDir: string,
  event: string,
  payload: unknown,
  opts: { dryRun?: boolean } = {}
): Promise<WorkflowRunResult[]> {
  if (executionDepth > 0) return []; // no nested workflow cascades
  const results: WorkflowRunResult[] = [];
  const all = listWorkflows(dataDir);

  executionDepth++;
  try {
    for (const wf of all) {
      if (!wf.enabled || !triggerMatches(wf.trigger, event)) continue;
      const matched = evaluateConditions(wf.conditions, payload);
      const result: WorkflowRunResult = { workflowId: wf.id, matched, actions: [] };
      if (matched && !opts.dryRun) {
        for (const action of wf.actions) {
          const r = await executeAction(dataDir, action, payload);
          result.actions.push({ tool: action.tool, ...r });
        }
        const updated = listWorkflows(dataDir).map((w) =>
          w.id === wf.id
            ? { ...w, lastRunAt: new Date().toISOString(), runCount: (w.runCount ?? 0) + 1 }
            : w
        );
        writeWorkflows(dataDir, updated);
        logger.info("workflow", "fired", { id: wf.id, event, actions: result.actions.length });
      }
      results.push(result);
    }
  } finally {
    executionDepth--;
  }
  return results;
}

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listWorkflows,
  saveWorkflow,
  toggleWorkflow,
  runWorkflowsForEvent,
  ACTION_WHITELIST,
  type WorkflowCondition,
  type WorkflowAction,
} from "../../core/workflow-engine.js";
import { enforceRbac } from "../../core/rbac.js";
import { writeAuditEntry, getActor } from "../../fs/audit-log.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

function ok(obj: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}
function fail(err: unknown): { content: Array<{ type: "text"; text: string }> } {
  return ok({ success: false, error: (err as Error).message });
}

const conditionSchema = z.object({
  field: z.string().describe('Dot path into the event payload, e.g. "deal.stage"'),
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "exists"]),
  value: z.unknown().optional(),
});

const actionSchema = z.object({
  tool: z.enum(ACTION_WHITELIST).describe("Whitelisted action"),
  args: z
    .record(z.string(), z.unknown())
    .describe("Action args; string values support {{payload.path}} templates"),
});

// ─── create_workflow ──────────────────────────────────────────────────────────

export async function handleCreateWorkflow(
  input: {
    name: string;
    trigger: string;
    conditions?: WorkflowCondition[];
    actions: WorkflowAction[];
    enabled?: boolean;
    dryRun?: boolean;
    sampleEvent?: unknown;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    enforceRbac(dataDir, "create_workflow");
    if (input.dryRun) {
      // Validate + simulate against a sample event without persisting/executing.
      const tmp = saveWorkflow(dataDir, {
        name: input.name,
        trigger: input.trigger,
        conditions: input.conditions ?? [],
        actions: input.actions,
        enabled: true,
      });
      const results = await runWorkflowsForEvent(dataDir, input.trigger, input.sampleEvent ?? {}, {
        dryRun: true,
      });
      const mine = results.find((r) => r.workflowId === tmp.id);
      // Remove the temporary rule again.
      const { listWorkflows: list } = await import("../../core/workflow-engine.js");
      const { writeJsonArray } = await import("../../fs/json-store.js");
      const path = await import("path");
      writeJsonArray(
        path.join(dataDir, ".agentic", "workflows.json"),
        "workflows",
        list(dataDir).filter((w) => w.id !== tmp.id)
      );
      return ok({
        dryRun: true,
        wouldMatch: mine?.matched ?? false,
        actions: input.actions.map((a) => a.tool),
      });
    }

    const workflow = saveWorkflow(dataDir, {
      name: input.name,
      trigger: input.trigger,
      conditions: input.conditions ?? [],
      actions: input.actions,
      enabled: input.enabled ?? true,
    });
    writeAuditEntry(dataDir, {
      timestamp: new Date().toISOString(),
      actor: getActor(),
      tool: "create_workflow",
      slug: "-",
      summary: `${workflow.name} (${workflow.trigger})`,
    });
    return ok({ success: true, workflow });
  } catch (err) {
    return fail(err);
  }
}

export function registerCreateWorkflow(server: McpServer): void {
  server.registerTool(
    "create_workflow",
    {
      title: "Create Workflow",
      description: `Create a declarative if-then automation rule (#48): on an internal event
(deal.updated, ticket.created, quote.accepted, quote.paid, email.replied,
record.created — or wildcards like "deal.*"), when all conditions match the
event payload, run whitelisted actions (${ACTION_WHITELIST.join(", ")}).
String args support {{payload.path}} templates. Every action passes the
autonomy-policy gate (auto|approve|block) and is audited.
Pass dryRun:true (+ sampleEvent) to validate/simulate without saving.

Example: deal won → onboarding:
  trigger "deal.updated", conditions [{field:"deal.stage",op:"eq",value:"won"}],
  actions [{tool:"enroll_in_sequence",args:{slug:"{{slug}}",contactEmail:"…",sequenceId:"onboarding"}},
           {tool:"create_ticket",args:{slug:"{{slug}}",title:"Onboard {{deal.name}}"}},
           {tool:"notify",args:{slug:"{{slug}}",message:"🎉 {{deal.name}} won!"}}]

Returns: { success, workflow } or { dryRun, wouldMatch, actions }`,
      inputSchema: z.object({
        name: z.string().describe("Rule name"),
        trigger: z.string().describe('Event name or wildcard ("deal.updated", "deal.*", "*")'),
        conditions: z.array(conditionSchema).optional().describe("All must match (AND)"),
        actions: z.array(actionSchema).min(1),
        enabled: z.boolean().optional().describe("Default: true"),
        dryRun: z.boolean().optional().describe("Validate + simulate only"),
        sampleEvent: z.unknown().optional().describe("Sample payload for dryRun"),
      }),
    },
    async (input) =>
      handleCreateWorkflow({
        name: input.name,
        trigger: input.trigger,
        actions: input.actions as WorkflowAction[],
        ...(input.conditions !== undefined
          ? { conditions: input.conditions as WorkflowCondition[] }
          : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.dryRun !== undefined ? { dryRun: input.dryRun } : {}),
        ...(input.sampleEvent !== undefined ? { sampleEvent: input.sampleEvent } : {}),
      })
  );
}

// ─── list_workflows ───────────────────────────────────────────────────────────

export async function handleListWorkflows(
  _input: Record<string, never>,
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const workflows = listWorkflows(dataDir);
    return ok({ count: workflows.length, workflows });
  } catch (err) {
    return fail(err);
  }
}

export function registerListWorkflows(server: McpServer): void {
  server.registerTool(
    "list_workflows",
    {
      title: "List Workflows",
      description: `List all automation rules with enabled state, runCount and lastRunAt (#48).

Returns: { count, workflows }`,
      inputSchema: z.object({}),
    },
    async () => handleListWorkflows({})
  );
}

// ─── toggle_workflow ──────────────────────────────────────────────────────────

export async function handleToggleWorkflow(
  input: { id: string; enabled: boolean },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    enforceRbac(dataDir, "toggle_workflow");
    const wf = toggleWorkflow(dataDir, input.id, input.enabled);
    if (!wf) return ok({ success: false, error: `Workflow '${input.id}' not found` });
    return ok({ success: true, workflow: wf });
  } catch (err) {
    return fail(err);
  }
}

export function registerToggleWorkflow(server: McpServer): void {
  server.registerTool(
    "toggle_workflow",
    {
      title: "Toggle Workflow",
      description: `Enable or disable an automation rule (#48).

Returns: { success, workflow }`,
      inputSchema: z.object({
        id: z.string().describe("Workflow id"),
        enabled: z.boolean(),
      }),
    },
    async ({ id, enabled }) => handleToggleWorkflow({ id, enabled })
  );
}

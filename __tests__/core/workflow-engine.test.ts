import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const mockEnroll = vi.hoisted(() => vi.fn());
const mockCreateTicket = vi.hoisted(() => vi.fn());
const mockEnqueue = vi.hoisted(() => vi.fn());
vi.mock("../../src/mcp/tools/enroll-in-sequence.js", () => ({
  handleEnrollInSequence: mockEnroll,
}));
vi.mock("../../src/mcp/tools/create-ticket.js", () => ({ handleCreateTicket: mockCreateTicket }));
vi.mock("../../src/core/proactive-agent.js", () => ({ enqueueTask: mockEnqueue }));

const DATA_DIR = "/data";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  mockEnroll.mockResolvedValue({ content: [] });
  mockCreateTicket.mockResolvedValue({ content: [] });
  mockEnqueue.mockResolvedValue({ id: "q" });
});

const wonRule = {
  name: "Deal won → onboarding",
  trigger: "deal.updated",
  conditions: [{ field: "deal.stage", op: "eq" as const, value: "won" }],
  actions: [
    {
      tool: "enroll_in_sequence",
      args: { slug: "{{slug}}", contactEmail: "a@acme.com", sequenceId: "onboarding" },
    },
    { tool: "create_ticket", args: { slug: "{{slug}}", title: "Onboard {{deal.name}}" } },
    { tool: "notify", args: { slug: "{{slug}}", message: "🎉 {{deal.name}} won!" } },
  ],
  enabled: true,
};

describe("workflow engine (#48)", () => {
  it("fires the acceptance-criteria rule: won deal → enroll + ticket + notify", async () => {
    const { saveWorkflow, runWorkflowsForEvent } =
      await import("../../src/core/workflow-engine.js");
    saveWorkflow(DATA_DIR, wonRule);

    const results = await runWorkflowsForEvent(DATA_DIR, "deal.updated", {
      slug: "acme",
      deal: { name: "Enterprise", stage: "won" },
    });

    expect(results[0]!.matched).toBe(true);
    expect(results[0]!.actions.map((a) => a.status)).toEqual(["executed", "executed", "executed"]);
    // template interpolation
    expect(mockEnroll.mock.calls[0]![0]).toMatchObject({ slug: "acme" });
    expect(mockCreateTicket.mock.calls[0]![0]).toMatchObject({ title: "Onboard Enterprise" });
    expect(
      (mockEnqueue.mock.calls[0]![1] as { payload: { message: string } }).payload.message
    ).toBe("🎉 Enterprise won!");
    // audit trail
    const { readAuditLog } = await import("../../src/fs/audit-log.js");
    const audit = readAuditLog(DATA_DIR).filter((e) => e.actor === "workflow");
    expect(audit.length).toBe(3);
    // run counters
    const { listWorkflows } = await import("../../src/core/workflow-engine.js");
    expect(listWorkflows(DATA_DIR)[0]!.runCount).toBe(1);
  });

  it("does not fire when a condition fails or the rule is disabled", async () => {
    const { saveWorkflow, runWorkflowsForEvent, toggleWorkflow, listWorkflows } =
      await import("../../src/core/workflow-engine.js");
    const wf = saveWorkflow(DATA_DIR, wonRule);

    const noMatch = await runWorkflowsForEvent(DATA_DIR, "deal.updated", {
      slug: "acme",
      deal: { name: "X", stage: "proposal" },
    });
    expect(noMatch[0]!.matched).toBe(false);
    expect(mockEnroll).not.toHaveBeenCalled();

    toggleWorkflow(DATA_DIR, wf.id, false);
    const disabled = await runWorkflowsForEvent(DATA_DIR, "deal.updated", {
      slug: "acme",
      deal: { name: "X", stage: "won" },
    });
    expect(disabled).toHaveLength(0);
    expect(listWorkflows(DATA_DIR)[0]!.enabled).toBe(false);
  });

  it("dryRun evaluates without executing", async () => {
    const { saveWorkflow, runWorkflowsForEvent } =
      await import("../../src/core/workflow-engine.js");
    saveWorkflow(DATA_DIR, wonRule);
    const results = await runWorkflowsForEvent(
      DATA_DIR,
      "deal.updated",
      { slug: "acme", deal: { name: "E", stage: "won" } },
      { dryRun: true }
    );
    expect(results[0]!.matched).toBe(true);
    expect(mockEnroll).not.toHaveBeenCalled();
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  it("policy approve queues the action instead of executing (HITL)", async () => {
    const { setPolicy, listApprovals } = await import("../../src/core/approvals.js");
    setPolicy(DATA_DIR, "create_ticket", "approve");
    const { saveWorkflow, runWorkflowsForEvent } =
      await import("../../src/core/workflow-engine.js");
    saveWorkflow(DATA_DIR, wonRule);

    const results = await runWorkflowsForEvent(DATA_DIR, "deal.updated", {
      slug: "acme",
      deal: { name: "E", stage: "won" },
    });
    const ticketAction = results[0]!.actions.find((a) => a.tool === "create_ticket");
    expect(ticketAction?.status).toBe("pending");
    expect(mockCreateTicket).not.toHaveBeenCalled();
    expect(listApprovals(DATA_DIR, "pending")).toHaveLength(1);
  });

  it("rejects non-whitelisted actions", async () => {
    const { saveWorkflow } = await import("../../src/core/workflow-engine.js");
    expect(() =>
      saveWorkflow(DATA_DIR, {
        ...wonRule,
        actions: [{ tool: "export_customer", args: {} }],
      })
    ).toThrow(/not allowed/);
  });

  it("supports condition ops and wildcard triggers", async () => {
    const { evaluateCondition, triggerMatches } = await import("../../src/core/workflow-engine.js");
    const payload = { deal: { value: 5000, tags: ["a", "b"], name: "Acme Deal" } };
    expect(evaluateCondition({ field: "deal.value", op: "gt", value: 1000 }, payload)).toBe(true);
    expect(evaluateCondition({ field: "deal.value", op: "lt", value: 1000 }, payload)).toBe(false);
    expect(evaluateCondition({ field: "deal.name", op: "contains", value: "Acme" }, payload)).toBe(
      true
    );
    expect(evaluateCondition({ field: "deal.tags", op: "contains", value: "b" }, payload)).toBe(
      true
    );
    expect(evaluateCondition({ field: "deal.ghost", op: "exists" }, payload)).toBe(false);
    expect(triggerMatches("deal.*", "deal.updated")).toBe(true);
    expect(triggerMatches("*", "anything")).toBe(true);
    expect(triggerMatches("deal.updated", "ticket.created")).toBe(false);
  });

  it("does not cascade: a nested event during execution triggers no second pass", async () => {
    const { saveWorkflow, runWorkflowsForEvent } =
      await import("../../src/core/workflow-engine.js");
    // notify-action whose execution emits another matching event would loop;
    // simulate by making enqueueTask re-enter the engine.
    saveWorkflow(DATA_DIR, {
      name: "loop",
      trigger: "deal.updated",
      conditions: [],
      actions: [{ tool: "notify", args: { message: "x" } }],
      enabled: true,
    });
    let nested: unknown[] = [];
    mockEnqueue.mockImplementation(async () => {
      const { runWorkflowsForEvent: run } = await import("../../src/core/workflow-engine.js");
      nested = await run(DATA_DIR, "deal.updated", {});
      return { id: "q" };
    });
    const outer = await runWorkflowsForEvent(DATA_DIR, "deal.updated", {});
    expect(outer[0]!.actions[0]!.status).toBe("executed");
    expect(nested).toEqual([]); // depth guard
  });
});

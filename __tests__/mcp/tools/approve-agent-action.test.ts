import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";

function makePipelineMd(): string {
  return `# Pipeline

| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |
|------|-------|-------|----------|-------------|------------|-------|---------|
| Q3 Renewal | negotiation | 50000 |  | 75 | 2026-06-15 | Budget confirmed | 2026-05-20 |`;
}

function makeAction(overrides: object = {}): import("../../../src/agents/deal-agent.js").DealAgentAction {
  return {
    actionId: "da_test_abc123",
    type: "alert",
    payload: { slug: SLUG, message: "Test alert", urgency: "medium" },
    confidence: 0.9,
    reasoning: "Test reasoning",
    requiresHumanApproval: true,
    status: "pending",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeQueueJson(actions: import("../../../src/agents/deal-agent.js").DealAgentAction[] = []): string {
  return JSON.stringify({
    schemaVersion: "1",
    slug: SLUG,
    pendingActions: actions,
    updatedAt: new Date().toISOString(),
  });
}

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe("handleApproveAgentAction", () => {
  it("returns error when actionId not found in queue", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/agent-queue.json`]: makeQueueJson([]),
    });
    const { handleApproveAgentAction } = await import("../../../src/mcp/tools/approve-agent-action.js");
    const result = await handleApproveAgentAction(
      { slug: SLUG, actionId: "da_nonexistent_000", approved: true },
      DATA_DIR
    );
    const parsed = parseResult(result);
    expect(parsed["success"]).toBe(false);
    expect(typeof parsed["error"]).toBe("string");
  });

  it("sets status=rejected when approved=false", async () => {
    const action = makeAction();
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/agent-queue.json`]: makeQueueJson([action]),
    });
    const { handleApproveAgentAction, readAgentQueue } = await import("../../../src/mcp/tools/approve-agent-action.js");
    const result = await handleApproveAgentAction(
      { slug: SLUG, actionId: action.actionId, approved: false },
      DATA_DIR
    );
    const parsed = parseResult(result);
    expect(parsed["success"]).toBe(true);
    expect(parsed["status"]).toBe("rejected");

    // Verify persisted in queue
    const queue = readAgentQueue(DATA_DIR, SLUG);
    const persisted = queue.pendingActions.find((a) => a.actionId === action.actionId);
    expect(persisted!.status).toBe("rejected");
  });

  it("executes action and sets status=executed when approved=true (alert type)", async () => {
    const action = makeAction({ type: "alert" });
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/agent-queue.json`]: makeQueueJson([action]),
    });
    const { handleApproveAgentAction, readAgentQueue } = await import("../../../src/mcp/tools/approve-agent-action.js");
    const result = await handleApproveAgentAction(
      { slug: SLUG, actionId: action.actionId, approved: true },
      DATA_DIR
    );
    const parsed = parseResult(result);
    expect(parsed["success"]).toBe(true);
    expect(parsed["status"]).toBe("executed");
  });

  it("executes log_interaction action when approved=true", async () => {
    const action = makeAction({
      type: "log_interaction",
      payload: { slug: SLUG, type: "Note", summary: "Approved note", with: "Max Müller" },
    });
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/agent-queue.json`]: makeQueueJson([action]),
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: "",
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
    });
    const { handleApproveAgentAction } = await import("../../../src/mcp/tools/approve-agent-action.js");
    const result = await handleApproveAgentAction(
      { slug: SLUG, actionId: action.actionId, approved: true },
      DATA_DIR
    );
    const parsed = parseResult(result);
    expect(parsed["success"]).toBe(true);
    expect(parsed["status"]).toBe("executed");
  });
});

describe("registerApproveAgentAction — MCP registration", () => {
  it("registers tool with name approve_agent_action", async () => {
    const { registerApproveAgentAction } = await import("../../../src/mcp/tools/approve-agent-action.js");
    const registeredTools: string[] = [];
    const fakeServer = {
      registerTool: (name: string) => { registeredTools.push(name); },
    };
    registerApproveAgentAction(fakeServer as never);
    expect(registeredTools).toContain("approve_agent_action");
  });
});

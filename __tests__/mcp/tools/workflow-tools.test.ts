import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

const DATA_DIR = "/data";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  vol.mkdirSync(`${DATA_DIR}/.agentic`, { recursive: true });
});

function parse(res: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
}

const wonRule = {
  name: "Deal won → notify",
  trigger: "deal.updated",
  conditions: [{ field: "deal.stage", op: "eq" as const, value: "won" }],
  actions: [{ tool: "notify" as const, args: { slug: "{{slug}}", message: "🎉 {{deal.name}}" } }],
};

describe("create_workflow / list_workflows / toggle_workflow (#48, #69)", () => {
  it("creates a rule and lists it", async () => {
    const { handleCreateWorkflow, handleListWorkflows } =
      await import("../../../src/mcp/tools/workflow-tools.js");
    const created = parse(await handleCreateWorkflow(wonRule, DATA_DIR));
    expect(created["success"]).toBe(true);
    expect((created["workflow"] as { enabled: boolean }).enabled).toBe(true);

    const listed = parse(await handleListWorkflows({}, DATA_DIR));
    expect(listed["count"]).toBe(1);
  });

  it("toggles a rule off and reports unknown ids", async () => {
    const { handleCreateWorkflow, handleToggleWorkflow } =
      await import("../../../src/mcp/tools/workflow-tools.js");
    const created = parse(await handleCreateWorkflow(wonRule, DATA_DIR));
    const id = (created["workflow"] as { id: string }).id;

    const toggled = parse(await handleToggleWorkflow({ id, enabled: false }, DATA_DIR));
    expect((toggled["workflow"] as { enabled: boolean }).enabled).toBe(false);

    const missing = parse(await handleToggleWorkflow({ id: "wf_nope", enabled: true }, DATA_DIR));
    expect(missing["success"]).toBe(false);
  });

  it("dryRun simulates without persisting the rule", async () => {
    const { handleCreateWorkflow, handleListWorkflows } =
      await import("../../../src/mcp/tools/workflow-tools.js");
    const match = parse(
      await handleCreateWorkflow(
        {
          ...wonRule,
          dryRun: true,
          sampleEvent: { slug: "acme", deal: { stage: "won", name: "Big Deal" } },
        },
        DATA_DIR
      )
    );
    expect(match["dryRun"]).toBe(true);
    expect(match["wouldMatch"]).toBe(true);
    expect(match["actions"]).toEqual(["notify"]);

    const noMatch = parse(
      await handleCreateWorkflow(
        { ...wonRule, dryRun: true, sampleEvent: { deal: { stage: "lost" } } },
        DATA_DIR
      )
    );
    expect(noMatch["wouldMatch"]).toBe(false);

    // the temporary rules were removed again
    const listed = parse(await handleListWorkflows({}, DATA_DIR));
    expect(listed["count"]).toBe(0);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";

const validLlmResponse = JSON.stringify({
  name: "negotiation-price-objection",
  trigger: "deal_stage_negotiation AND value > 50000",
  content: "# Price Objection\n\n## Steps\n1. Focus on ROI.",
  successRate: 1.0,
  reasoning: "Won by ROI framing",
});

describe("distill_playbook tool", () => {
  it("returns error when interactions.md missing", async () => {
    vol.fromJSON({});
    const { handleDistillPlaybook } = await import("../../../src/mcp/tools/distill-playbook.js");
    const res = await handleDistillPlaybook(
      { slug: SLUG, dealName: "Enterprise", outcome: "won" },
      DATA_DIR,
      async () => validLlmResponse
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.success).toBe(false);
    expect(data.error).toContain(SLUG);
  });

  it("calls llmFn with a prompt", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]:
        "## 2026-05-01 · Call\n**Summary:** Good call.",
    });
    const { handleDistillPlaybook } = await import("../../../src/mcp/tools/distill-playbook.js");
    let receivedPrompt = "";
    await handleDistillPlaybook(
      { slug: SLUG, dealName: "Enterprise", outcome: "won" },
      DATA_DIR,
      async (p) => {
        receivedPrompt = p;
        return validLlmResponse;
      }
    );
    expect(receivedPrompt).toContain("Enterprise");
  });

  it("writes playbook and returns success on valid LLM response", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]:
        "## 2026-05-01 · Call\n**Summary:** Good call.",
    });
    const { handleDistillPlaybook } = await import("../../../src/mcp/tools/distill-playbook.js");
    const res = await handleDistillPlaybook(
      { slug: SLUG, dealName: "Enterprise", outcome: "won" },
      DATA_DIR,
      async () => validLlmResponse
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.success).toBe(true);
    expect(data.playbook.name).toBe("negotiation-price-objection");
    expect(data.reasoning).toBe("Won by ROI framing");
  });

  it("returns error when LLM response unparseable", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/interactions.md`]: "## 2026-05-01 · Call\n**Summary:** Ok.",
    });
    const { handleDistillPlaybook } = await import("../../../src/mcp/tools/distill-playbook.js");
    const res = await handleDistillPlaybook(
      { slug: SLUG, dealName: "Deal", outcome: "lost" },
      DATA_DIR,
      async () => "Not valid JSON at all"
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.success).toBe(false);
  });

  it("registers tool with correct name", async () => {
    const { registerDistillPlaybook } = await import("../../../src/mcp/tools/distill-playbook.js");
    const calls: string[] = [];
    const fakeServer = { registerTool: (name: string) => calls.push(name) };
    registerDistillPlaybook(fakeServer as never);
    expect(calls).toContain("distill_playbook");
  });

  it("registered handler invokes handleDistillPlaybook with all params", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/interactions.md`]: "## Note\nSome content." });
    const { registerDistillPlaybook } = await import("../../../src/mcp/tools/distill-playbook.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerDistillPlaybook(fakeServer as never);
    const result = await capturedHandler!({ slug: "acme", dealName: "Acme Deal", outcome: "won" });
    const parsed = JSON.parse(result.content[0]!.text) as { success: boolean };
    expect(typeof parsed.success).toBe("boolean");
  });

  it("returns error response when distillPlaybook throws unexpectedly", async () => {
    vi.doMock("../../../src/core/playbooks.js", () => ({
      distillPlaybook: vi.fn().mockRejectedValue(new Error("unexpected distill error")),
      listPlaybooks: vi.fn(),
      matchPlaybooks: vi.fn(),
      writePlaybook: vi.fn(),
      playbooksDir: vi.fn(),
      toKebabCase: vi.fn(),
    }));
    vol.fromJSON({});
    const { handleDistillPlaybook } = await import("../../../src/mcp/tools/distill-playbook.js");
    const res = await handleDistillPlaybook(
      { slug: SLUG, dealName: "Deal", outcome: "won" },
      DATA_DIR
    );
    const data = JSON.parse(res.content[0]!.text) as { success: boolean; error: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain("unexpected distill error");
  });
});

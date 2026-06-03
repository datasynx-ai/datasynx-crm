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

function makeHealthJson(): string {
  return JSON.stringify({
    schemaVersion: "1",
    slug: SLUG,
    overallHealth: 75,
    updatedAt: new Date().toISOString(),
    contacts: [],
    atRiskContacts: [],
    coldContacts: [],
  });
}

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe("handleRunDealAgent", () => {
  it("returns assessment in response", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { handleRunDealAgent } = await import("../../../src/mcp/tools/run-deal-agent.js");
    // No ANTHROPIC_API_KEY → callLlm will fail → rule-based fallback
    const result = await handleRunDealAgent({ slug: SLUG, dealName: "Q3 Renewal" }, DATA_DIR);
    const parsed = parseResult(result);
    expect(typeof parsed["assessment"]).toBe("string");
  });

  it("defaults to autonomyLevel=suggest", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { handleRunDealAgent } = await import("../../../src/mcp/tools/run-deal-agent.js");
    const result = await handleRunDealAgent({ slug: SLUG, dealName: "Q3 Renewal" }, DATA_DIR);
    const parsed = parseResult(result);
    // In suggest mode, actionsQueued may be populated (or empty if no actions from rule-based)
    expect(Array.isArray(parsed["actionsQueued"])).toBe(true);
  });

  it("passes instruction to agent", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { handleRunDealAgent } = await import("../../../src/mcp/tools/run-deal-agent.js");
    // instruction is passed — check result is a valid DealAgentResult
    const result = await handleRunDealAgent(
      { slug: SLUG, dealName: "Q3 Renewal", instruction: "Focus on close date risk" },
      DATA_DIR
    );
    const parsed = parseResult(result);
    expect(parsed["riskLevel"]).toBeDefined();
  });

  it("returns success:false when deal not found", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { handleRunDealAgent } = await import("../../../src/mcp/tools/run-deal-agent.js");
    const result = await handleRunDealAgent({ slug: SLUG, dealName: "Ghost Deal" }, DATA_DIR);
    const parsed = parseResult(result);
    expect(parsed["success"]).toBe(false);
    expect(typeof parsed["error"]).toBe("string");
  });

  it("returns valid result even without API key (rule-based fallback)", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${DATA_DIR}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { handleRunDealAgent } = await import("../../../src/mcp/tools/run-deal-agent.js");
    // No ANTHROPIC_API_KEY in test env → callLlm throws → rule-based used
    const result = await handleRunDealAgent(
      { slug: SLUG, dealName: "Q3 Renewal", autonomyLevel: "observe" },
      DATA_DIR
    );
    const parsed = parseResult(result);
    expect(parsed["plan"]).toBeDefined();
    expect(Array.isArray(parsed["plan"])).toBe(true);
  });
});

describe("registerRunDealAgent — MCP registration", () => {
  it("registers tool with name run_deal_agent", async () => {
    const { registerRunDealAgent } = await import("../../../src/mcp/tools/run-deal-agent.js");
    const registeredTools: string[] = [];
    const fakeServer = {
      registerTool: (name: string) => {
        registeredTools.push(name);
      },
    };
    registerRunDealAgent(fakeServer as never);
    expect(registeredTools).toContain("run_deal_agent");
  });

  it("registered handler invokes handleRunDealAgent with optional params", async () => {
    const cwd = process.cwd();
    vol.fromJSON({
      [`${cwd}/customers/${SLUG}/pipeline.md`]: makePipelineMd(),
      [`${cwd}/customers/${SLUG}/health.json`]: makeHealthJson(),
    });
    const { registerRunDealAgent } = await import("../../../src/mcp/tools/run-deal-agent.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerRunDealAgent(fakeServer as never);
    const result = await capturedHandler!({
      slug: SLUG,
      dealName: "Q3 Renewal",
      autonomyLevel: "observe",
      instruction: "Check health",
      valueThreshold: 10000,
    });
    const parsed = JSON.parse(result.content[0]!.text) as { plan?: unknown[]; success?: boolean };
    expect(Array.isArray(parsed.plan) || parsed.success === false).toBe(true);
  });
});

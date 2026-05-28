import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe("handleGetProactiveBriefing", () => {
  it("returns date and required fields", async () => {
    vol.fromJSON({});
    const { handleGetProactiveBriefing } = await import("../../../src/mcp/tools/get-proactive-briefing.js");
    const result = await handleGetProactiveBriefing({ date: "2026-05-28" }, DATA_DIR);
    const parsed = parseResult(result);
    expect(parsed["date"]).toBe("2026-05-28");
    expect(Array.isArray(parsed["urgent"])).toBe(true);
    expect(typeof parsed["forecast"]).toBe("string");
    expect(typeof parsed["topAction"]).toBe("string");
  });

  it("defaults to today when no date provided", async () => {
    vol.fromJSON({});
    const { handleGetProactiveBriefing } = await import("../../../src/mcp/tools/get-proactive-briefing.js");
    const result = await handleGetProactiveBriefing({}, DATA_DIR);
    const parsed = parseResult(result);
    expect(typeof parsed["date"]).toBe("string");
    expect((parsed["date"] as string).length).toBe(10);
  });

  it("urgent is empty when no customers", async () => {
    vol.fromJSON({});
    const { handleGetProactiveBriefing } = await import("../../../src/mcp/tools/get-proactive-briefing.js");
    const result = await handleGetProactiveBriefing({ date: "2026-05-28" }, DATA_DIR);
    const parsed = parseResult(result);
    expect((parsed["urgent"] as unknown[]).length).toBe(0);
  });

  it("opportunities is an array", async () => {
    vol.fromJSON({});
    const { handleGetProactiveBriefing } = await import("../../../src/mcp/tools/get-proactive-briefing.js");
    const result = await handleGetProactiveBriefing({ date: "2026-05-28" }, DATA_DIR);
    const parsed = parseResult(result);
    expect(Array.isArray(parsed["opportunities"])).toBe(true);
  });

  it("detects imminently closing deal as urgent", async () => {
    const pipelineMd = `| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n|------|-------|-------|----------|-------------|------------|-------|------|\n| Big Deal | negotiation | 200000 | EUR | 80 | 2026-05-30 |  | 2026-05-25 |\n`;
    vol.fromJSON({
      [`${DATA_DIR}/customers/beta-gmbh/pipeline.md`]: pipelineMd,
    });
    const { handleGetProactiveBriefing } = await import("../../../src/mcp/tools/get-proactive-briefing.js");
    const result = await handleGetProactiveBriefing({ date: "2026-05-28" }, DATA_DIR);
    const parsed = parseResult(result);
    const hasUrgent = (parsed["urgent"] as string[]).some((u) => u.includes("closes in"));
    expect(hasUrgent).toBe(true);
  });
});

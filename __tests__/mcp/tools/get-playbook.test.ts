import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";

function makePlaybookMd(trigger = "deal_stage_negotiation AND value > 50000"): string {
  return `---\ntrigger: ${trigger}\nsuccessRate: 0.73\nusedCount: 14\nlastUpdated: 2026-05-20\n---\n\n# Enterprise Renewal\n\n## Steps\n1. Call buyer.`;
}

describe("get_playbook tool", () => {
  it("returns empty matches when no playbooks dir", async () => {
    vol.fromJSON({});
    const { handleGetPlaybook } = await import("../../../src/mcp/tools/get-playbook.js");
    const res = await handleGetPlaybook({ slug: SLUG }, DATA_DIR);
    const data = JSON.parse(res.content[0]!.text);
    expect(data.matches).toEqual([]);
    expect(data.totalPlaybooks).toBe(0);
  });

  it("returns all playbooks when no deal context provided", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/p1.md`]: makePlaybookMd(),
      [`${DATA_DIR}/customers/${SLUG}/playbooks/p2.md`]: makePlaybookMd("no_champion"),
    });
    const { handleGetPlaybook } = await import("../../../src/mcp/tools/get-playbook.js");
    const res = await handleGetPlaybook({ slug: SLUG }, DATA_DIR);
    const data = JSON.parse(res.content[0]!.text);
    expect(data.totalPlaybooks).toBe(2);
    expect(data.matches).toHaveLength(2);
  });

  it("returns only matching playbooks when deal context provided", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/match.md`]: makePlaybookMd(
        "deal_stage_negotiation AND value > 50000"
      ),
      [`${DATA_DIR}/customers/${SLUG}/playbooks/nomatch.md`]: makePlaybookMd("deal_stage_proposal"),
    });
    const { handleGetPlaybook } = await import("../../../src/mcp/tools/get-playbook.js");
    const res = await handleGetPlaybook(
      { slug: SLUG, stage: "negotiation", value: 75000 },
      DATA_DIR
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.matches).toHaveLength(1);
    expect(data.matches[0].name).toBe("match");
  });

  it("returns empty matches when no trigger conditions met", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/p1.md`]: makePlaybookMd("deal_stage_proposal"),
    });
    const { handleGetPlaybook } = await import("../../../src/mcp/tools/get-playbook.js");
    const res = await handleGetPlaybook(
      { slug: SLUG, stage: "negotiation", value: 75000 },
      DATA_DIR
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.matches).toHaveLength(0);
  });

  it("returns matches sorted by successRate", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/low.md`]: `---\ntrigger: deal_stage_negotiation\nsuccessRate: 0.4\nusedCount: 2\nlastUpdated: 2026-05-20\n---\n\n# Low`,
      [`${DATA_DIR}/customers/${SLUG}/playbooks/high.md`]: `---\ntrigger: deal_stage_negotiation\nsuccessRate: 0.9\nusedCount: 8\nlastUpdated: 2026-05-20\n---\n\n# High`,
    });
    const { handleGetPlaybook } = await import("../../../src/mcp/tools/get-playbook.js");
    const res = await handleGetPlaybook({ slug: SLUG, stage: "negotiation" }, DATA_DIR);
    const data = JSON.parse(res.content[0]!.text);
    expect(data.matches[0].successRate).toBe(0.9);
  });

  it("registers tool with correct name", async () => {
    const { registerGetPlaybook } = await import("../../../src/mcp/tools/get-playbook.js");
    const calls: string[] = [];
    const fakeServer = { registerTool: (name: string) => calls.push(name) };
    registerGetPlaybook(fakeServer as never);
    expect(calls).toContain("get_playbook");
  });

  it("registered handler invokes handleGetPlaybook with optional params", async () => {
    vol.fromJSON({});
    const { registerGetPlaybook } = await import("../../../src/mcp/tools/get-playbook.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerGetPlaybook(fakeServer as never);
    const result = await capturedHandler!({
      slug: SLUG,
      stage: "negotiation",
      value: 50000,
      healthScore: 75,
      daysSinceContact: 7,
      championPresent: true,
    });
    const parsed = JSON.parse(result.content[0]!.text) as { matches: unknown[] };
    expect(Array.isArray(parsed.matches)).toBe(true);
  });

  it("returns error response when listPlaybooks throws", async () => {
    vi.doMock("../../../src/core/playbooks.js", () => ({
      listPlaybooks: vi.fn().mockImplementation(() => {
        throw new Error("playbook fs error");
      }),
      matchPlaybooks: vi.fn(),
    }));
    vol.fromJSON({});
    const { handleGetPlaybook } = await import("../../../src/mcp/tools/get-playbook.js");
    const res = await handleGetPlaybook({ slug: SLUG, stage: "negotiation" }, DATA_DIR);
    const data = JSON.parse(res.content[0]!.text);
    expect(data.success).toBe(false);
    expect(data.error).toContain("playbook fs error");
  });
});

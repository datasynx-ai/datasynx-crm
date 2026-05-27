import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";

function makePlaybookMd(trigger = "deal_stage_negotiation", successRate = 0.73): string {
  return `---\ntrigger: ${trigger}\nsuccessRate: ${successRate}\nusedCount: 5\nlastUpdated: 2026-05-20\n---\n\n# Playbook\n\n## Steps\n1. Do thing.`;
}

describe("list_playbooks tool", () => {
  it("returns empty list for new customer", async () => {
    vol.fromJSON({});
    const { handleListPlaybooks } = await import("../../../src/mcp/tools/list-playbooks.js");
    const res = await handleListPlaybooks({ slug: SLUG }, DATA_DIR);
    const data = JSON.parse(res.content[0]!.text);
    expect(data.playbooks).toEqual([]);
    expect(data.count).toBe(0);
  });

  it("returns list without body content", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/p1.md`]: makePlaybookMd(),
    });
    const { handleListPlaybooks } = await import("../../../src/mcp/tools/list-playbooks.js");
    const res = await handleListPlaybooks({ slug: SLUG }, DATA_DIR);
    const data = JSON.parse(res.content[0]!.text);
    expect(data.playbooks).toHaveLength(1);
    expect(data.playbooks[0].content).toBeUndefined();
  });

  it("returns correct count in response", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/a.md`]: makePlaybookMd(),
      [`${DATA_DIR}/customers/${SLUG}/playbooks/b.md`]: makePlaybookMd("no_champion"),
    });
    const { handleListPlaybooks } = await import("../../../src/mcp/tools/list-playbooks.js");
    const res = await handleListPlaybooks({ slug: SLUG }, DATA_DIR);
    const data = JSON.parse(res.content[0]!.text);
    expect(data.count).toBe(2);
  });

  it("includes trigger and successRate per playbook", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/playbooks/p1.md`]: makePlaybookMd("deal_stage_proposal", 0.8),
    });
    const { handleListPlaybooks } = await import("../../../src/mcp/tools/list-playbooks.js");
    const res = await handleListPlaybooks({ slug: SLUG }, DATA_DIR);
    const data = JSON.parse(res.content[0]!.text);
    expect(data.playbooks[0].trigger).toBe("deal_stage_proposal");
    expect(data.playbooks[0].successRate).toBe(0.8);
  });

  it("registers tool with correct name", async () => {
    const { registerListPlaybooks } = await import("../../../src/mcp/tools/list-playbooks.js");
    const calls: string[] = [];
    const fakeServer = { registerTool: (name: string) => calls.push(name) };
    registerListPlaybooks(fakeServer as never);
    expect(calls).toContain("list_playbooks");
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";

describe("create_playbook tool", () => {
  it("creates playbook file and returns success", async () => {
    vol.fromJSON({});
    const { handleCreatePlaybook } = await import("../../../src/mcp/tools/create-playbook.js");
    const res = await handleCreatePlaybook(
      {
        slug: SLUG,
        name: "my-playbook",
        trigger: "deal_stage_negotiation AND value > 50000",
        content: "# My Playbook\n\n## Steps\n1. Do thing.",
      },
      DATA_DIR
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.success).toBe(true);
    expect(data.playbook.name).toBe("my-playbook");
    expect(data.playbook.trigger).toBe("deal_stage_negotiation AND value > 50000");
    expect(data.playbook.path).toContain("my-playbook.md");
  });

  it("normalizes name to kebab-case", async () => {
    vol.fromJSON({});
    const { handleCreatePlaybook } = await import("../../../src/mcp/tools/create-playbook.js");
    const res = await handleCreatePlaybook(
      { slug: SLUG, name: "My Playbook With Spaces!", trigger: "no_champion", content: "# X" },
      DATA_DIR
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.playbook.name).toMatch(/^[a-z0-9-]+$/);
  });

  it("sets default successRate=0.5 when not provided", async () => {
    vol.fromJSON({});
    const { handleCreatePlaybook } = await import("../../../src/mcp/tools/create-playbook.js");
    const res = await handleCreatePlaybook(
      { slug: SLUG, name: "test", trigger: "no_champion", content: "# Test" },
      DATA_DIR
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.playbook.successRate).toBe(0.5);
  });

  it("uses provided successRate when given", async () => {
    vol.fromJSON({});
    const { handleCreatePlaybook } = await import("../../../src/mcp/tools/create-playbook.js");
    const res = await handleCreatePlaybook(
      { slug: SLUG, name: "test", trigger: "no_champion", content: "# Test", successRate: 0.8 },
      DATA_DIR
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.playbook.successRate).toBe(0.8);
  });

  it("upserts: second call with same name overwrites the playbook", async () => {
    vol.fromJSON({});
    const { handleCreatePlaybook } = await import("../../../src/mcp/tools/create-playbook.js");
    await handleCreatePlaybook(
      {
        slug: SLUG,
        name: "my-playbook",
        trigger: "no_champion",
        content: "# v1",
        successRate: 0.5,
      },
      DATA_DIR
    );
    const res = await handleCreatePlaybook(
      {
        slug: SLUG,
        name: "my-playbook",
        trigger: "has_champion",
        content: "# v2",
        successRate: 0.9,
      },
      DATA_DIR
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.success).toBe(true);
    expect(data.playbook.trigger).toBe("has_champion");
    expect(data.playbook.successRate).toBe(0.9);
  });

  it("registered handler invokes handleCreatePlaybook with optional successRate", async () => {
    vol.fromJSON({});
    const { registerCreatePlaybook } = await import("../../../src/mcp/tools/create-playbook.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerCreatePlaybook(fakeServer as never);
    const result = await capturedHandler!({
      slug: SLUG,
      name: "Enterprise Close",
      trigger: "has_champion AND value > 50000",
      content: "## Steps\n1. Call buyer.",
      successRate: 0.75,
    });
    const parsed = JSON.parse(result.content[0]!.text) as { success: boolean };
    expect(typeof parsed.success).toBe("boolean");
  });

  it("returns error response when writePlaybook throws", async () => {
    vi.doMock("../../../src/core/playbooks.js", () => ({
      writePlaybook: vi.fn().mockRejectedValue(new Error("write error")),
      playbooksDir: vi.fn().mockReturnValue("/data/customers/acme-corp/playbooks"),
      toKebabCase: vi.fn().mockImplementation((s: string) => s.toLowerCase().replace(/\s+/g, "-")),
    }));
    vol.fromJSON({});
    const { handleCreatePlaybook } = await import("../../../src/mcp/tools/create-playbook.js");
    const res = await handleCreatePlaybook(
      { slug: SLUG, name: "test", trigger: "no_champion", content: "# X" },
      DATA_DIR
    );
    const data = JSON.parse(res.content[0]!.text);
    expect(data.success).toBe(false);
    expect(data.error).toContain("write error");
  });

  it("registers tool with correct name", async () => {
    const { registerCreatePlaybook } = await import("../../../src/mcp/tools/create-playbook.js");
    const calls: string[] = [];
    const fakeServer = { registerTool: (name: string) => calls.push(name) };
    registerCreatePlaybook(fakeServer as never);
    expect(calls).toContain("create_playbook");
  });
});

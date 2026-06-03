import { describe, it, expect, vi } from "vitest";
import { CRM_PROMPTS, registerPrompts } from "../../src/mcp/prompts.js";

describe("CRM_PROMPTS", () => {
  it("defines the core playbook prompts", () => {
    const names = CRM_PROMPTS.map((p) => p.name);
    expect(names).toContain("deal_risk_review");
    expect(names).toContain("draft_follow_up");
    expect(names).toContain("account_brief");
    expect(names).toContain("pipeline_summary");
  });

  it("each prompt builds slug-aware text referencing real MCP tools", () => {
    for (const p of CRM_PROMPTS) {
      const text = p.build({ slug: "acme-corp" });
      expect(text).toContain("acme-corp");
      expect(text.length).toBeGreaterThan(20);
    }
    const dealRisk = CRM_PROMPTS.find((p) => p.name === "deal_risk_review")!;
    expect(dealRisk.build({ slug: "acme-corp" })).toMatch(/get_deal_health|open_deal_room/);
  });
});

describe("registerPrompts", () => {
  it("registers every prompt on the server with an argsSchema and a text message", () => {
    const calls: Array<{
      name: string;
      config: { argsSchema?: unknown };
      cb: (a: { slug: string }) => unknown;
    }> = [];
    const fakeServer = {
      registerPrompt: (
        name: string,
        config: { argsSchema?: unknown },
        cb: (a: { slug: string }) => unknown
      ) => {
        calls.push({ name, config, cb });
      },
    };

    registerPrompts(fakeServer as never);

    expect(calls).toHaveLength(CRM_PROMPTS.length);
    expect(calls[0]!.config.argsSchema).toBeDefined();
    const result = calls[0]!.cb({ slug: "acme-corp" }) as {
      messages: Array<{ role: string; content: { type: string; text: string } }>;
    };
    expect(result.messages[0]!.content.type).toBe("text");
    expect(result.messages[0]!.content.text).toContain("acme-corp");
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => { const { fs } = await import("memfs"); return { default: fs, ...fs }; });
vi.mock("@lancedb/lancedb", () => ({ connect: vi.fn().mockResolvedValue({ tableNames: vi.fn().mockResolvedValue([]) }) }));

const DATA_DIR = "/data";
const MAIN_FACTS = [
  "---",
  "name: Acme Corp",
  "domain: acme.com",
  "email: ceo@acme.com",
  "relationship_stage: prospect",
  "tags: []",
  "currency: EUR",
  "created: '2026-05-29'",
  "updated: '2026-05-29'",
  "last_touchpoint: 2026-05-29",
  "---",
  "",
].join("\n");

const TEMPLATE_CONTENT = `---
id: intro
subject: Hello {{company}}
category: outreach
variables:
  - company
  - firstName
language: de
createdAt: '2026-05-29'
---

Hi {{firstName}}, we at {{company}} want to connect.`;

describe("handleDraftEmail", () => {
  beforeEach(() => { vol.reset(); vi.resetModules(); });

  it("interpolates company from main_facts.md", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS,
      [`${DATA_DIR}/.agentic/templates/outreach/intro.md`]: TEMPLATE_CONTENT,
    });
    const { handleDraftEmail } = await import("../../../src/mcp/tools/draft-email.js");
    const res = await handleDraftEmail({ slug: "acme", templateId: "intro" }, DATA_DIR);
    const parsed = JSON.parse(res.content[0]!.text) as { subject: string; body: string; to: string };
    expect(parsed.subject).toBe("Hello Acme Corp");
    expect(parsed.to).toBe("ceo@acme.com");
  });

  it("overrides take precedence over auto variables", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS,
      [`${DATA_DIR}/.agentic/templates/outreach/intro.md`]: TEMPLATE_CONTENT,
    });
    const { handleDraftEmail } = await import("../../../src/mcp/tools/draft-email.js");
    const res = await handleDraftEmail({ slug: "acme", templateId: "intro", overrides: { company: "Custom Name" } }, DATA_DIR);
    const parsed = JSON.parse(res.content[0]!.text) as { subject: string };
    expect(parsed.subject).toBe("Hello Custom Name");
  });

  it("unresolved variables stay as {{var}}", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS,
      [`${DATA_DIR}/.agentic/templates/outreach/intro.md`]: TEMPLATE_CONTENT,
    });
    const { handleDraftEmail } = await import("../../../src/mcp/tools/draft-email.js");
    const res = await handleDraftEmail({ slug: "acme", templateId: "intro" }, DATA_DIR);
    const parsed = JSON.parse(res.content[0]!.text) as { body: string };
    expect(parsed.body).toContain("{{firstName}}");
  });

  it("returns error for missing template", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS });
    const { handleDraftEmail } = await import("../../../src/mcp/tools/draft-email.js");
    const res = await handleDraftEmail({ slug: "acme", templateId: "ghost" }, DATA_DIR);
    const parsed = JSON.parse(res.content[0]!.text) as { error: string };
    expect(parsed.error).toContain("ghost");
  });

  it("subject is also interpolated", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS,
      [`${DATA_DIR}/.agentic/templates/outreach/intro.md`]: TEMPLATE_CONTENT,
    });
    const { handleDraftEmail } = await import("../../../src/mcp/tools/draft-email.js");
    const res = await handleDraftEmail({ slug: "acme", templateId: "intro" }, DATA_DIR);
    const parsed = JSON.parse(res.content[0]!.text) as { subject: string };
    expect(parsed.subject).not.toContain("{{");
  });
});

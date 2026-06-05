import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";
import matter from "gray-matter";
import { handleExportCustomer } from "../../../src/mcp/tools/export-customer.js";

function makeMainFacts(name: string): string {
  return matter.stringify("", {
    name,
    relationship_stage: "active",
    created: "2026-01-01",
    updated: "2026-05-01",
    tags: [],
    currency: "EUR",
  });
}

function makeInteractions(): string {
  return `# Interactions\n\n## 2026-05-20 · Call\n**With:** John\n**Summary:** Test call summary\n**Next Steps:**\n- [ ] Follow up\n**Source:** agent://log/1\n**Synced:** 2026-05-20\n---\n`;
}

function makePipeline(): string {
  return `# Pipeline\n\n| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n|------|-------|-------|----------|-------------|------------|-------|--------|\n| Deal One | proposal | 25000 | EUR | 70 | 2026-08-31 | Key deal | 2026-05-01 |\n`;
}

describe("export_customer tool", () => {
  beforeEach(() => {
    vol.reset();
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env["DXCRM_ACTOR"];
  });

  afterEach(() => {
    delete process.env["DXCRM_ACTOR"];
  });

  it("exports customer as JSON by default", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp"),
      "/data/customers/acme-corp/interactions.md": makeInteractions(),
      "/data/customers/acme-corp/pipeline.md": makePipeline(),
    });

    const result = await handleExportCustomer({ slug: "acme-corp" }, "/data");

    expect(result.content).toBeDefined();
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as {
      slug: string;
      mainFacts: Record<string, unknown>;
      interactionsCount: number;
      pipeline: unknown[];
    };

    expect(parsed.slug).toBe("acme-corp");
    expect(parsed.mainFacts).toBeDefined();
    expect(typeof parsed.interactionsCount).toBe("number");
    expect(Array.isArray(parsed.pipeline)).toBe(true);
  });

  it("exports customer as markdown when format=markdown", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp"),
      "/data/customers/acme-corp/interactions.md": makeInteractions(),
      "/data/customers/acme-corp/pipeline.md": makePipeline(),
    });

    const result = await handleExportCustomer({ slug: "acme-corp", format: "markdown" }, "/data");

    const text = (result.content[0] as { type: string; text: string }).text;
    // Should contain markdown content, not raw JSON
    expect(text).toContain("acme-corp");
    expect(text).not.toMatch(/^{/); // Not raw JSON object start
  });

  it("inlines attachment Markdown when includeAttachmentContent=true (markdown)", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp"),
      "/data/customers/acme-corp/interactions.md": makeInteractions(),
      "/data/customers/acme-corp/attachments/msg1__order.csv": "item,qty\nWidget,3",
      "/data/customers/acme-corp/attachments/msg1__order.csv.md":
        "# order.csv\n\n| item | qty |\n| --- | --- |\n| Widget | 3 |",
    });

    const result = await handleExportCustomer(
      { slug: "acme-corp", format: "markdown", includeAttachmentContent: true },
      "/data"
    );
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("## Attachment Contents (1)");
    expect(text).toContain("### msg1__order.csv.md");
    expect(text).toContain("| Widget | 3 |");
  });

  it("includes attachmentContents in JSON when requested, omits it otherwise", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp"),
      "/data/customers/acme-corp/attachments/msg1__note.txt.md": "# note.txt\n\nhello",
    });

    const withContent = await handleExportCustomer(
      { slug: "acme-corp", includeAttachmentContent: true },
      "/data"
    );
    const parsed = JSON.parse((withContent.content[0] as { text: string }).text) as {
      attachmentContents?: Record<string, string>;
    };
    expect(parsed.attachmentContents?.["msg1__note.txt.md"]).toContain("hello");

    const without = await handleExportCustomer({ slug: "acme-corp" }, "/data");
    const parsed2 = JSON.parse((without.content[0] as { text: string }).text) as {
      attachmentContents?: unknown;
    };
    expect(parsed2.attachmentContents).toBeUndefined();
  });

  it("returns error for non-existent customer", async () => {
    vol.fromJSON({});

    const result = await handleExportCustomer({ slug: "unknown" }, "/data");

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("unknown");
  });

  it("counts interactions correctly", async () => {
    const twoInteractions = `# Interactions\n\n## 2026-05-20 · Call\n**With:** John\n**Summary:** Call one\n**Next Steps:**\n- [ ] —\n**Source:** agent://log/1\n**Synced:** 2026-05-20\n---\n\n## 2026-05-19 · Email\n**Subject:** Email subj\n**Summary:** Email one\n**Next Steps:**\n- [ ] —\n**Source:** agent://log/2\n**Synced:** 2026-05-19\n---\n`;

    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp"),
      "/data/customers/acme-corp/interactions.md": twoInteractions,
    });

    const result = await handleExportCustomer({ slug: "acme-corp" }, "/data");
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { interactionsCount: number };
    expect(parsed.interactionsCount).toBe(2);
  });
});

describe("export_customer — RBAC enforcement", () => {
  beforeEach(() => {
    vol.reset();
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env["DXCRM_ACTOR"];
  });

  afterEach(() => {
    delete process.env["DXCRM_ACTOR"];
  });

  it("throws 'Access denied' when rep calls export_customer and rbac.json exists", async () => {
    vol.fromJSON({
      "/data/.agentic/rbac.json": JSON.stringify({ actors: { alice: "rep" } }),
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp"),
    });
    process.env["DXCRM_ACTOR"] = "alice";

    const { handleExportCustomer: handler } =
      await import("../../../src/mcp/tools/export-customer.js");
    await expect(handler({ slug: "acme-corp" }, "/data")).rejects.toThrow(/access denied/i);
  });

  it("succeeds when admin calls export_customer", async () => {
    vol.fromJSON({
      "/data/.agentic/rbac.json": JSON.stringify({ actors: { alice: "admin" } }),
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp"),
    });
    process.env["DXCRM_ACTOR"] = "alice";

    const { handleExportCustomer: handler } =
      await import("../../../src/mcp/tools/export-customer.js");
    const result = await handler({ slug: "acme-corp" }, "/data");
    expect(result.isError).toBeFalsy();
  });

  it("open access (no rbac.json) allows any actor to export", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp"),
    });

    const { handleExportCustomer: handler } =
      await import("../../../src/mcp/tools/export-customer.js");
    const result = await handler({ slug: "acme-corp" }, "/data");
    expect(result.isError).toBeFalsy();
  });
});

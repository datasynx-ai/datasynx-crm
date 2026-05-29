import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => { const { fs } = await import("memfs"); return { default: fs, ...fs }; });
vi.mock("@lancedb/lancedb", () => ({ connect: vi.fn().mockResolvedValue({ tableNames: vi.fn().mockResolvedValue([]) }) }));

const DATA_DIR = "/data";

function makeTemplate(id = "intro", category = "outreach") {
  return {
    id,
    subject: "Hello {{company}}",
    category,
    variables: ["company"],
    language: "de",
    createdAt: "2026-05-29T00:00:00.000Z",
    body: "Hi {{firstName}},\n\nLet's connect.",
  };
}

describe("template-store", () => {
  beforeEach(() => { vol.reset(); vi.resetModules(); });

  it("listTemplates returns empty when directory missing", async () => {
    vol.fromJSON({});
    const { listTemplates } = await import("../../src/fs/template-store.js");
    expect(listTemplates(DATA_DIR)).toEqual([]);
  });

  it("writeTemplate + listTemplates roundtrip", async () => {
    vol.fromJSON({});
    const { writeTemplate, listTemplates } = await import("../../src/fs/template-store.js");
    writeTemplate(DATA_DIR, makeTemplate());
    const templates = listTemplates(DATA_DIR);
    expect(templates).toHaveLength(1);
    expect(templates[0]!.id).toBe("intro");
    expect(templates[0]!.subject).toBe("Hello {{company}}");
    expect(templates[0]!.body).toContain("Let's connect");
  });

  it("getTemplate finds by id across categories", async () => {
    vol.fromJSON({});
    const { writeTemplate, getTemplate } = await import("../../src/fs/template-store.js");
    writeTemplate(DATA_DIR, makeTemplate("enterprise-intro", "outreach"));
    const found = getTemplate(DATA_DIR, "enterprise-intro");
    expect(found).not.toBeNull();
    expect(found!.id).toBe("enterprise-intro");
  });

  it("getTemplate returns null for missing id", async () => {
    vol.fromJSON({});
    const { getTemplate } = await import("../../src/fs/template-store.js");
    expect(getTemplate(DATA_DIR, "nonexistent")).toBeNull();
  });

  it("listTemplates filters by category", async () => {
    vol.fromJSON({});
    const { writeTemplate, listTemplates } = await import("../../src/fs/template-store.js");
    writeTemplate(DATA_DIR, makeTemplate("a", "outreach"));
    writeTemplate(DATA_DIR, makeTemplate("b", "support"));
    const outreach = listTemplates(DATA_DIR, { category: "outreach" });
    expect(outreach).toHaveLength(1);
    expect(outreach[0]!.id).toBe("a");
  });

  it("deleteTemplate removes file and returns true", async () => {
    vol.fromJSON({});
    const { writeTemplate, deleteTemplate, getTemplate } = await import("../../src/fs/template-store.js");
    writeTemplate(DATA_DIR, makeTemplate());
    const deleted = deleteTemplate(DATA_DIR, "intro");
    expect(deleted).toBe(true);
    expect(getTemplate(DATA_DIR, "intro")).toBeNull();
  });

  it("deleteTemplate returns false for missing template", async () => {
    vol.fromJSON({});
    const { deleteTemplate } = await import("../../src/fs/template-store.js");
    expect(deleteTemplate(DATA_DIR, "ghost")).toBe(false);
  });

  it("body is stored and retrieved correctly with special characters", async () => {
    vol.fromJSON({});
    const { writeTemplate, getTemplate } = await import("../../src/fs/template-store.js");
    const tmpl = { ...makeTemplate(), body: "Line1\nLine2\n\n# Header\n{{var}}" };
    writeTemplate(DATA_DIR, tmpl);
    const found = getTemplate(DATA_DIR, "intro");
    expect(found!.body).toContain("# Header");
    expect(found!.body).toContain("{{var}}");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

const mockListTemplates = vi.hoisted(() => vi.fn());
const mockGetTemplate = vi.hoisted(() => vi.fn());
const mockExtractVariables = vi.hoisted(() => vi.fn());

vi.mock("../../../src/fs/template-store.js", () => ({
  listTemplates: mockListTemplates,
  getTemplate: mockGetTemplate,
}));

vi.mock("../../../src/core/template-engine.js", () => ({
  extractVariables: mockExtractVariables,
}));

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/data";

function makeTemplate(id: string, category = "sales") {
  return {
    id,
    subject: "Hello {{customerName}}",
    category,
    variables: ["{{customerName}}"],
    language: "en",
    createdAt: "2026-05-30T10:00:00Z",
    body: "Dear {{customerName}}, thank you for your interest.",
  };
}

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
});

// ─── list_email_templates ──────────────────────────────────────────────────────

describe("handleListEmailTemplates", () => {
  it("returns all templates when no category filter", async () => {
    mockListTemplates.mockReturnValue([makeTemplate("intro"), makeTemplate("followup")]);
    const { handleListEmailTemplates } = await import("../../../src/mcp/tools/list-email-templates.js");
    const result = await handleListEmailTemplates({}, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as unknown[];
    expect(parsed.length).toBe(2);
  });

  it("strips body from template list (meta only)", async () => {
    mockListTemplates.mockReturnValue([makeTemplate("intro")]);
    const { handleListEmailTemplates } = await import("../../../src/mcp/tools/list-email-templates.js");
    const result = await handleListEmailTemplates({}, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as Array<{ body?: string; id: string }>;
    expect(parsed[0].body).toBeUndefined();
    expect(parsed[0].id).toBe("intro");
  });

  it("passes category filter to listTemplates", async () => {
    mockListTemplates.mockReturnValue([]);
    const { handleListEmailTemplates } = await import("../../../src/mcp/tools/list-email-templates.js");
    await handleListEmailTemplates({ category: "support" }, DATA_DIR);
    expect(mockListTemplates).toHaveBeenCalledWith(DATA_DIR, { category: "support" });
  });

  it("returns empty array when no templates", async () => {
    mockListTemplates.mockReturnValue([]);
    const { handleListEmailTemplates } = await import("../../../src/mcp/tools/list-email-templates.js");
    const result = await handleListEmailTemplates({}, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as unknown[];
    expect(parsed.length).toBe(0);
  });
});

// ─── get_email_template ────────────────────────────────────────────────────────

describe("handleGetEmailTemplate", () => {
  it("returns error when template not found", async () => {
    mockGetTemplate.mockReturnValue(null);
    const { handleGetEmailTemplate } = await import("../../../src/mcp/tools/get-email-template.js");
    const result = await handleGetEmailTemplate({ id: "missing" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { error: string };
    expect(parsed.error).toContain("missing");
  });

  it("returns template with detectedVariables", async () => {
    mockGetTemplate.mockReturnValue(makeTemplate("intro"));
    mockExtractVariables.mockReturnValue(["{{customerName}}", "{{dealValue}}"]);
    const { handleGetEmailTemplate } = await import("../../../src/mcp/tools/get-email-template.js");
    const result = await handleGetEmailTemplate({ id: "intro" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { detectedVariables: string[]; id: string };
    expect(parsed.id).toBe("intro");
    expect(parsed.detectedVariables).toContain("{{customerName}}");
  });

  it("deduplicates detected variables", async () => {
    mockGetTemplate.mockReturnValue(makeTemplate("intro"));
    mockExtractVariables.mockReturnValue(["{{name}}", "{{name}}", "{{email}}"]);
    const { handleGetEmailTemplate } = await import("../../../src/mcp/tools/get-email-template.js");
    const result = await handleGetEmailTemplate({ id: "intro" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { detectedVariables: string[] };
    const nameCount = parsed.detectedVariables.filter((v) => v === "{{name}}").length;
    expect(nameCount).toBe(1);
  });
});

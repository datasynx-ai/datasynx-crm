import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EmailTemplate } from "../../src/schemas/email-template.js";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockListTemplates = vi.hoisted(() => vi.fn());
const mockGetTemplate = vi.hoisted(() => vi.fn());
const mockWriteTemplate = vi.hoisted(() => vi.fn());
const mockDeleteTemplate = vi.hoisted(() => vi.fn());
const mockInterpolate = vi.hoisted(() => vi.fn());
const mockBuildVariablesFromCustomer = vi.hoisted(() => vi.fn());

vi.mock("../../src/fs/template-store.js", () => ({
  listTemplates: mockListTemplates,
  getTemplate: mockGetTemplate,
  writeTemplate: mockWriteTemplate,
  deleteTemplate: mockDeleteTemplate,
}));

vi.mock("../../src/core/template-engine.js", () => ({
  interpolate: mockInterpolate,
  buildVariablesFromCustomer: mockBuildVariablesFromCustomer,
}));

function makeTmpl(overrides: Partial<EmailTemplate> = {}): EmailTemplate {
  return {
    id: "intro",
    subject: "Hello {{firstName}}",
    category: "onboarding",
    variables: ["firstName"],
    language: "de",
    createdAt: "2026-01-01T00:00:00Z",
    body: "Hi {{firstName}}, welcome!",
    ...overrides,
  };
}

const DATA_DIR = "/data";

describe("templateCommand list — with category filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("filters by category when --category is provided", async () => {
    mockListTemplates.mockReturnValue([makeTmpl()]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync(["node", "template", "list", "--category", "onboarding"]);

    expect(mockListTemplates).toHaveBeenCalledWith(DATA_DIR, { category: "onboarding" });
    consoleSpy.mockRestore();
  });
});

describe("templateCommand — process.cwd() fallbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["DXCRM_DATA_DIR"];
    mockListTemplates.mockReturnValue([]);
    mockGetTemplate.mockReturnValue(makeTmpl());
    mockWriteTemplate.mockImplementation(() => undefined);
    mockDeleteTemplate.mockReturnValue(true);
    mockInterpolate.mockImplementation((s: string) => s);
  });

  afterEach(() => {
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("list uses process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync(["node", "template", "list"]);
    consoleSpy.mockRestore();
  });

  it("get uses process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync(["node", "template", "get", "intro"]);
    consoleSpy.mockRestore();
  });

  it("preview uses process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync(["node", "template", "preview", "intro"]);
    consoleSpy.mockRestore();
  });

  it("create uses process.cwd() when env not set", async () => {
    mockGetTemplate.mockReturnValue(null);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync(["node", "template", "create", "new-tmpl"]);
    consoleSpy.mockRestore();
  });

  it("delete uses process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync(["node", "template", "delete", "intro"]);
    consoleSpy.mockRestore();
  });
});

describe("templateCommand list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("shows templates", async () => {
    mockListTemplates.mockReturnValue([makeTmpl()]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync(["node", "template", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("intro"));
    consoleSpy.mockRestore();
  });

  it("shows 'No templates found' when list is empty", async () => {
    mockListTemplates.mockReturnValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync(["node", "template", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No templates"));
    consoleSpy.mockRestore();
  });
});

describe("templateCommand get", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("prints template details", async () => {
    mockGetTemplate.mockReturnValue(makeTmpl());
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync(["node", "template", "get", "intro"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Hello"));
    consoleSpy.mockRestore();
  });

  it("shows (none defined) when template has no variables", async () => {
    mockGetTemplate.mockReturnValue(makeTmpl({ variables: [] }));
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync(["node", "template", "get", "intro"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("(none defined)"));
    consoleSpy.mockRestore();
  });

  it("exits when template not found", async () => {
    mockGetTemplate.mockReturnValue(null);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as () => never);

    const { templateCommand } = await import("../../src/commands/template.js");
    await expect(
      templateCommand.parseAsync(["node", "template", "get", "no-tmpl"])
    ).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("templateCommand preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
    mockInterpolate.mockImplementation((s: string) => s.replace(/\{\{[^}]+\}\}/g, "Alice"));
  });

  it("previews template without slug (empty vars)", async () => {
    mockGetTemplate.mockReturnValue(makeTmpl());
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync(["node", "template", "preview", "intro"]);

    expect(mockInterpolate).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("exits when template not found for preview", async () => {
    mockGetTemplate.mockReturnValue(null);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as () => never);

    const { templateCommand } = await import("../../src/commands/template.js");
    await expect(
      templateCommand.parseAsync(["node", "template", "preview", "no-tmpl"])
    ).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("previews template with slug vars", async () => {
    mockGetTemplate.mockReturnValue(makeTmpl());
    mockBuildVariablesFromCustomer.mockResolvedValue({ firstName: "Bob" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync(["node", "template", "preview", "intro", "--slug", "acme"]);

    expect(mockBuildVariablesFromCustomer).toHaveBeenCalledWith(DATA_DIR, "acme");
    consoleSpy.mockRestore();
  });
});

describe("templateCommand create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
    mockWriteTemplate.mockImplementation(() => undefined);
  });

  it("creates template when it does not exist", async () => {
    mockGetTemplate.mockReturnValue(null);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync([
      "node",
      "template",
      "create",
      "welcome",
      "--category",
      "sales",
    ]);

    expect(mockWriteTemplate).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("created"));
    consoleSpy.mockRestore();
  });

  it("uses provided --subject when creating template", async () => {
    mockGetTemplate.mockReturnValue(null);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync([
      "node",
      "template",
      "create",
      "intro",
      "--subject",
      "Custom Subject Line",
    ]);

    expect(mockWriteTemplate).toHaveBeenCalledWith(
      DATA_DIR,
      expect.objectContaining({ subject: "Custom Subject Line" })
    );
    consoleSpy.mockRestore();
  });

  it("uses provided --body and --lang when creating template", async () => {
    mockGetTemplate.mockReturnValue(null);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync([
      "node",
      "template",
      "create",
      "welcome",
      "--subject",
      "Hi",
      "--body",
      "Custom body for {{firstName}}",
      "--lang",
      "en",
    ]);

    expect(mockWriteTemplate).toHaveBeenCalledWith(
      DATA_DIR,
      expect.objectContaining({ body: "Custom body for {{firstName}}", language: "en" })
    );
    consoleSpy.mockRestore();
  });

  it("exits when template already exists", async () => {
    mockGetTemplate.mockReturnValue(makeTmpl({ id: "welcome" }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as () => never);

    const { templateCommand } = await import("../../src/commands/template.js");
    await expect(
      templateCommand.parseAsync(["node", "template", "create", "welcome"])
    ).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("already exists"));
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

// ─── Doc-drift guard: documented `template create` flags must really exist ────
describe("templateCommand create — documented flags exist (doc-drift guard)", () => {
  it("every flag shown in docs/cli-reference.md for `template create` is registered", async () => {
    // The global test setup mocks `fs` with memfs; read the real docs file.
    const fs = await vi.importActual<typeof import("fs")>("fs");
    const path = (await import("node:path")).default;
    const url = await import("node:url");

    const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../..");
    const ref = fs.readFileSync(path.join(root, "docs/cli-reference.md"), "utf-8");

    const usage = ref.split("\n").find((l) => l.includes("dxcrm template create"));
    expect(usage, "docs/cli-reference.md should document `dxcrm template create`").toBeDefined();
    const documentedFlags = [...usage!.matchAll(/--([a-z-]+)/g)].map((m) => m[1]);
    expect(documentedFlags.length).toBeGreaterThan(0);

    // Resolve the actual `create` subcommand and its registered long options.
    const { templateCommand } = await import("../../src/commands/template.js");
    const createCmd = templateCommand.commands.find((c) => c.name() === "create");
    expect(createCmd, "`template create` subcommand should be registered").toBeDefined();
    const registeredFlags = createCmd!.options.map((o) => o.long?.replace(/^--/, ""));

    for (const flag of documentedFlags) {
      expect(registeredFlags, `documented flag --${flag} is not implemented`).toContain(flag);
    }
  });
});

describe("templateCommand delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("deletes existing template", async () => {
    mockDeleteTemplate.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { templateCommand } = await import("../../src/commands/template.js");
    await templateCommand.parseAsync(["node", "template", "delete", "intro"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("deleted"));
    consoleSpy.mockRestore();
  });

  it("exits when template not found for deletion", async () => {
    mockDeleteTemplate.mockReturnValue(false);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as () => never);

    const { templateCommand } = await import("../../src/commands/template.js");
    await expect(
      templateCommand.parseAsync(["node", "template", "delete", "no-tmpl"])
    ).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

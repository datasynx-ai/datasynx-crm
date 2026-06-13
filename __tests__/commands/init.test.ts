import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/setup/framework-registry.js", () => ({
  installAllDetected: vi.fn().mockResolvedValue([]),
}));

vi.mock("os", () => ({
  default: {
    homedir: () => "/home/testuser",
  },
  homedir: () => "/home/testuser",
}));

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
  process.env["DXCRM_DATA_DIR"] = "/crm";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env["DXCRM_DATA_DIR"];
});

describe("initCommand", () => {
  it("creates .agentic/ directory and config.json", async () => {
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    expect(vol.existsSync(`/crm/.agentic/config.json`)).toBe(true);
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("honors DXCRM_DATA_DIR over the current working directory", async () => {
    process.env["DXCRM_DATA_DIR"] = "/custom-vault";
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    // Initialized in the configured vault, NOT in cwd.
    expect(vol.existsSync("/custom-vault/.agentic/config.json")).toBe(true);
    expect(vol.existsSync(`${process.cwd()}/.agentic/config.json`)).toBe(false);
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("creates sources.json with gmail disabled by default", async () => {
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    const sourcesPath = `/crm/.agentic/sources.json`;
    expect(vol.existsSync(sourcesPath)).toBe(true);
    const sources = JSON.parse(vol.readFileSync(sourcesPath, "utf-8") as string) as {
      gmail: { enabled: boolean };
    };
    expect(sources.gmail.enabled).toBe(false);
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("creates customers/ directory", async () => {
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    expect(vol.existsSync(`/crm/customers`)).toBe(true);
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("shows success message with detected frameworks", async () => {
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([
      { framework: "claude-code", success: true, transport: "stdio" },
    ]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("claude-code");
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("shows failed framework when install fails", async () => {
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([
      { framework: "cursor", success: false, transport: "stdio", notes: "config not found" },
    ]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("cursor");
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("shows no-framework message when none detected", async () => {
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("No AI frameworks detected");
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("shows team server info when --team flag is provided", async () => {
    vol.fromJSON({});
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init", "--team", "http://vm-ip:3847/mcp"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("http://vm-ip:3847/mcp");
    expect(output).toContain("DXCRM_ACTOR");
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  it("does not overwrite existing config.json", async () => {
    const existingConfig = { version: 1, existing: true };
    vol.fromJSON({
      [`/crm/.agentic/config.json`]: JSON.stringify(existingConfig),
    });
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(["node", "init"]);

    const config = JSON.parse(vol.readFileSync(`/crm/.agentic/config.json`, "utf-8") as string) as {
      existing?: boolean;
    };
    expect(config.existing).toBe(true); // preserved
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });

  async function runInit(args: string[] = ["node", "init"]): Promise<void> {
    const { installAllDetected } = await import("../../src/setup/framework-registry.js");
    vi.mocked(installAllDetected).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { initCommand } = await import("../../src/commands/init.js");
    await initCommand.parseAsync(args);
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  }

  it("seeds starter templates and a sequence on a fresh vault", async () => {
    vol.fromJSON({});
    await runInit();

    const { listTemplates } = await import("../../src/fs/template-store.js");
    const { listSequences } = await import("../../src/fs/sequence-store.js");
    const { STARTER_TEMPLATES, STARTER_SEQUENCES } =
      await import("../../src/core/starter-content.js");

    expect(listTemplates("/crm")).toHaveLength(STARTER_TEMPLATES.length);
    expect(listSequences("/crm")).toHaveLength(STARTER_SEQUENCES.length);
  });

  it("makes draft_email work end-to-end on a freshly initialized vault", async () => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md": [
        "---",
        "name: Acme Corp",
        "domain: acme.com",
        "email: ceo@acme.com",
        "relationship_stage: prospect",
        "tags: []",
        "currency: EUR",
        "created: '2026-06-13'",
        "updated: '2026-06-13'",
        "last_touchpoint: 2026-06-13",
        "---",
        "",
      ].join("\n"),
    });
    await runInit();

    const { handleDraftEmail } = await import("../../src/mcp/tools/draft-email.js");
    const res = await handleDraftEmail({ slug: "acme", templateId: "starter-cold-intro" }, "/crm");
    const parsed = JSON.parse(res.content[0]!.text) as { subject: string; to: string };
    expect(parsed.subject).toBe("Quick question about Acme Corp");
    expect(parsed.to).toBe("ceo@acme.com");
  });

  it("makes enroll_in_sequence work end-to-end on a freshly initialized vault", async () => {
    vol.fromJSON({});
    await runInit();

    const { handleEnrollInSequence } = await import("../../src/mcp/tools/enroll-in-sequence.js");
    const res = await handleEnrollInSequence(
      { slug: "acme", contactEmail: "ceo@acme.com", sequenceId: "starter-cold-outreach" },
      "/crm"
    );
    const parsed = JSON.parse(res.content[0]!.text) as { enrollmentId: string; totalSteps: number };
    expect(parsed.enrollmentId).toMatch(/^enroll_/);
    expect(parsed.totalSteps).toBe(3);
  });

  it("does not resurrect a starter the user deleted on a later init", async () => {
    vol.fromJSON({});
    await runInit();
    expect(vol.existsSync("/crm/.agentic/templates/outreach/starter-breakup.md")).toBe(true);

    vol.rmSync("/crm/.agentic/templates/outreach/starter-breakup.md");
    await runInit();

    expect(vol.existsSync("/crm/.agentic/templates/outreach/starter-breakup.md")).toBe(false);
  });

  it("is idempotent: re-running init does not duplicate starters", async () => {
    vol.fromJSON({});
    await runInit();
    await runInit();

    const { listTemplates } = await import("../../src/fs/template-store.js");
    const { STARTER_TEMPLATES } = await import("../../src/core/starter-content.js");
    expect(listTemplates("/crm")).toHaveLength(STARTER_TEMPLATES.length);
  });
});

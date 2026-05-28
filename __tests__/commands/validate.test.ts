import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => vol.reset());

describe("validateCommand handler", () => {
  it("passes for valid customer", async () => {
    // Use quoted dates in YAML to ensure gray-matter parses them as strings, not JS Dates
    vol.fromJSON({
      "/crm/customers/acme-corp/main_facts.md": `---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
      "/crm/customers/acme-corp/interactions.md": "# Interactions\n",
    });
    const { MainFactsSchema } = await import("../../src/schemas/main-facts.js");
    const matter = await import("gray-matter");
    const { fs: memFs } = await import("memfs");
    const content = memFs.readFileSync(
      "/crm/customers/acme-corp/main_facts.md",
      "utf-8"
    ) as string;
    const { data } = matter.default(content);
    expect(() => MainFactsSchema.parse(data)).not.toThrow();
  });

  it("fails for missing main_facts.md", () => {
    const { fs: memFs } = require("memfs");
    expect(memFs.existsSync("/crm/customers/bad-co/main_facts.md")).toBe(false);
  });

  it("rejects invalid relationship_stage", async () => {
    vol.fromJSON({
      "/crm/customers/bad-corp/main_facts.md": `---\nname: Bad Corp\nrelationship_stage: invalid_stage\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
    });
    const { MainFactsSchema } = await import("../../src/schemas/main-facts.js");
    const matter = await import("gray-matter");
    const { fs: memFs } = await import("memfs");
    const content = memFs.readFileSync(
      "/crm/customers/bad-corp/main_facts.md",
      "utf-8"
    ) as string;
    const { data } = matter.default(content);
    expect(() => MainFactsSchema.parse(data)).toThrow();
  });

  it("rejects missing name", async () => {
    vol.fromJSON({
      "/crm/customers/no-name/main_facts.md": `---\nrelationship_stage: active\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
    });
    const { MainFactsSchema } = await import("../../src/schemas/main-facts.js");
    const matter = await import("gray-matter");
    const { fs: memFs } = await import("memfs");
    const content = memFs.readFileSync(
      "/crm/customers/no-name/main_facts.md",
      "utf-8"
    ) as string;
    const { data } = matter.default(content);
    expect(() => MainFactsSchema.parse(data)).toThrow();
  });
});

// ─── validate --fix ───────────────────────────────────────────────────────────

describe("validate --fix", () => {
  it("adds missing tags and currency defaults", async () => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md":
        `---\nname: Acme\nrelationship_stage: active\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
      "/crm/customers/acme/interactions.md": "",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runValidate } = await import("../../src/commands/validate.js");
    await runValidate({ fix: true }, "/crm");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("acme");
    logSpy.mockRestore();
  });

  it("fills updated from created when updated is missing", async () => {
    vol.fromJSON({
      "/crm/customers/nodate/main_facts.md":
        `---\nname: NoDa\nrelationship_stage: active\ncreated: '2026-01-10'\n---\n`,
      "/crm/customers/nodate/interactions.md": "",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runValidate } = await import("../../src/commands/validate.js");
    await runValidate({ fix: true }, "/crm");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("updated");
    logSpy.mockRestore();
  });

  it("does not fix non-recoverable errors (invalid stage)", async () => {
    vol.fromJSON({
      "/crm/customers/bad/main_facts.md":
        `---\nname: Bad\nrelationship_stage: unknown_stage\ncreated: '2026-05-25'\nupdated: '2026-05-25'\n---\n`,
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const { runValidate } = await import("../../src/commands/validate.js");
    await expect(runValidate({ fix: true }, "/crm")).rejects.toThrow("exit");
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("no-op when data is already complete", async () => {
    vol.fromJSON({
      "/crm/customers/full/main_facts.md":
        `---\nname: Full\nrelationship_stage: active\ncreated: '2026-05-25'\nupdated: '2026-05-25'\ntags: []\ncurrency: EUR\n---\n`,
      "/crm/customers/full/interactions.md": "",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runValidate } = await import("../../src/commands/validate.js");
    await runValidate({ fix: true }, "/crm");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).not.toContain("fixed");
    logSpy.mockRestore();
  });
});


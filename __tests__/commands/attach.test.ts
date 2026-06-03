import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAttach", () => {
  it("copies file to customers/<slug>/attachments/", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/main_facts.md": "---\nname: Acme\n---\n",
      "/tmp/contract.pdf": "binary data",
    });

    const { runAttach } = await import("../../src/commands/attach.js");
    const result = await runAttach("acme-corp", "/tmp/contract.pdf", "/crm");

    expect("error" in result).toBe(false);
    expect(vol.existsSync("/crm/customers/acme-corp/attachments/contract.pdf")).toBe(true);
  });

  it("returns error when customer does not exist", async () => {
    vol.fromJSON({ "/tmp/file.pdf": "data" });

    const { runAttach } = await import("../../src/commands/attach.js");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runAttach("nonexistent", "/tmp/file.pdf", "/crm");

    expect("error" in result).toBe(true);
    errorSpy.mockRestore();
  });

  it("returns error when source file does not exist", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/main_facts.md": "---\nname: Acme\n---\n",
    });

    const { runAttach } = await import("../../src/commands/attach.js");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runAttach("acme-corp", "/tmp/missing.pdf", "/crm");

    expect("error" in result).toBe(true);
    errorSpy.mockRestore();
  });

  it("is idempotent — does not overwrite existing attachment", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/main_facts.md": "---\nname: Acme\n---\n",
      "/crm/customers/acme-corp/attachments/contract.pdf": "original",
      "/tmp/contract.pdf": "new version",
    });

    const { runAttach } = await import("../../src/commands/attach.js");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runAttach("acme-corp", "/tmp/contract.pdf", "/crm");

    // Original file should not be overwritten
    const content = vol.readFileSync(
      "/crm/customers/acme-corp/attachments/contract.pdf",
      "utf-8"
    ) as string;
    expect(content).toBe("original");
    logSpy.mockRestore();
  });

  it("creates attachments/ dir if it does not exist", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/main_facts.md": "---\nname: Acme\n---\n",
      "/tmp/report.pdf": "pdf content",
    });

    const { runAttach } = await import("../../src/commands/attach.js");
    await runAttach("acme-corp", "/tmp/report.pdf", "/crm");

    expect(vol.existsSync("/crm/customers/acme-corp/attachments")).toBe(true);
  });
});

describe("runListAttachments", () => {
  it("returns list of attachment filenames", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/attachments/contract.pdf": "pdf",
      "/crm/customers/acme-corp/attachments/proposal.docx": "docx",
    });

    const { runListAttachments } = await import("../../src/commands/attach.js");
    const files = await runListAttachments("acme-corp", "/crm");

    expect(files).toHaveLength(2);
    expect(files).toContain("contract.pdf");
    expect(files).toContain("proposal.docx");
  });

  it("returns empty array when attachments/ does not exist", async () => {
    vol.fromJSON({ "/crm/customers/acme-corp/main_facts.md": "---\nname: Acme\n---\n" });

    const { runListAttachments } = await import("../../src/commands/attach.js");
    const files = await runListAttachments("acme-corp", "/crm");

    expect(files).toHaveLength(0);
  });
}); // end describe("runListAttachments")

describe("attachCommand — Commander structure", () => {
  it("exports attachCommand with name 'attach'", async () => {
    const { attachCommand } = await import("../../src/commands/attach.js");
    expect(attachCommand.name()).toBe("attach");
  });

  it("has <slug> and <file> arguments", async () => {
    const { attachCommand } = await import("../../src/commands/attach.js");
    const argNames = attachCommand.registeredArguments.map((a) => a.name());
    expect(argNames).toContain("slug");
    expect(argNames).toContain("file");
  });

  it("invokes runAttach when parseAsync is called", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/main_facts.md": "---\nname: Acme\n---\n",
      "/tmp/file.pdf": "pdf data",
    });
    process.env["DXCRM_DATA_DIR"] = "/crm";
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { attachCommand } = await import("../../src/commands/attach.js");
    await attachCommand.parseAsync(["node", "attach", "acme-corp", "/tmp/file.pdf"]);
    consoleSpy.mockRestore();
    delete process.env["DXCRM_DATA_DIR"];
  });
});

describe("export_customer — attachments in export", () => {
  it("includes attachments array in JSON export", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md":
        "---\nname: Acme Corp\nrelationship_stage: active\ncreated: 2026-01-01\nupdated: 2026-05-01\ntags: []\ncurrency: EUR\n---\n",
      "/data/customers/acme-corp/attachments/contract.pdf": "pdf",
      "/data/customers/acme-corp/attachments/proposal.docx": "docx",
    });

    const { handleExportCustomer } = await import("../../src/mcp/tools/export-customer.js");
    const result = await handleExportCustomer({ slug: "acme-corp" }, "/data");
    const text = (result.content[0] as { type: string; text: string }).text;
    const exported = JSON.parse(text) as { attachments: string[] };

    expect(exported.attachments).toHaveLength(2);
    expect(exported.attachments).toContain("contract.pdf");
    expect(exported.attachments).toContain("proposal.docx");
  });

  it("includes Attachments section in markdown export", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md":
        "---\nname: Acme Corp\nrelationship_stage: active\ncreated: 2026-01-01\nupdated: 2026-05-01\ntags: []\ncurrency: EUR\n---\n",
      "/data/customers/acme-corp/attachments/contract.pdf": "pdf",
    });

    const { handleExportCustomer } = await import("../../src/mcp/tools/export-customer.js");
    const result = await handleExportCustomer({ slug: "acme-corp", format: "markdown" }, "/data");
    const text = (result.content[0] as { type: string; text: string }).text;

    expect(text).toContain("## Attachments");
    expect(text).toContain("contract.pdf");
  });

  it("shows empty attachments when none exist", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md":
        "---\nname: Acme Corp\nrelationship_stage: active\ncreated: 2026-01-01\nupdated: 2026-05-01\ntags: []\ncurrency: EUR\n---\n",
    });

    const { handleExportCustomer } = await import("../../src/mcp/tools/export-customer.js");
    const result = await handleExportCustomer({ slug: "acme-corp" }, "/data");
    const text = (result.content[0] as { type: string; text: string }).text;
    const exported = JSON.parse(text) as { attachments: string[] };

    expect(exported.attachments).toHaveLength(0);
  });
});

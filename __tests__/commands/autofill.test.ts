import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  process.env["DXCRM_DATA_DIR"] = "/crm";
});
afterEach(() => {
  delete process.env["DXCRM_DATA_DIR"];
});

describe("dxcrm autofill", () => {
  it("extracts fields from a transcript file", async () => {
    vol.fromJSON({
      "/crm/call.txt": "We are in negotiation.\nNext step: send proposal Friday.",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { autofillCommand } = await import("../../src/commands/autofill.js");
    await autofillCommand.parseAsync(["node", "autofill", "/crm/call.txt"]);
    const out = logSpy.mock.calls.flat().join("\n");
    expect(out).toContain("negotiation");
    expect(out).toContain("send proposal");
    logSpy.mockRestore();
  });
});

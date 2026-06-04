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

describe("dxcrm ask", () => {
  it("prints retrieved sources", async () => {
    vol.fromJSON({ "/crm/.keep": "" });
    const { addMemory } = await import("../../src/core/memory.js");
    addMemory("/crm", {
      scope: "customer",
      slug: "acme",
      type: "fact",
      text: "Acme pays by invoice net 30",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { askCommand } = await import("../../src/commands/ask.js");
    await askCommand.parseAsync(["node", "ask", "how does acme pay invoices", "--slug", "acme"]);
    expect(logSpy.mock.calls.flat().join("\n")).toMatch(/invoice/i);
    logSpy.mockRestore();
  });
});

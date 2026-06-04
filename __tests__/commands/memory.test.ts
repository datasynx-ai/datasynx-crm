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

describe("dxcrm memory", () => {
  it("adds and lists a customer memory", async () => {
    vol.fromJSON({ "/crm/.keep": "" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { memoryCommand } = await import("../../src/commands/memory.js");
    await memoryCommand.parseAsync([
      "node",
      "memory",
      "add",
      "Pays by invoice",
      "--slug",
      "acme",
      "--type",
      "fact",
    ]);
    await memoryCommand.parseAsync(["node", "memory", "list", "--slug", "acme"]);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("Pays by invoice");
    logSpy.mockRestore();
  });
});
